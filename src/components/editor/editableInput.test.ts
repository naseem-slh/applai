import { afterEach, describe, expect, it } from 'vitest'
import {
  diffText,
  insertPlainText,
  isBlockedInputType,
  isFormattingShortcut,
  toPlainTextInsertion,
} from './editableInput'

afterEach(() => {
  window.getSelection()?.removeAllRanges()
  document.body.replaceChildren()
})

describe('diffText', () => {
  it('findet ein eingefügtes Zeichen mitten im Text', () => {
    expect(diffText('abc', 'abXc')).toEqual({ from: 2, to: 2, insert: 'X' })
  })

  it('findet ein gelöschtes Zeichen mitten im Text', () => {
    expect(diffText('abc', 'ac')).toEqual({ from: 1, to: 2, insert: '' })
  })

  it('findet ein ersetztes Wort und lässt Anfang und Ende stehen', () => {
    expect(diffText('Sehr geehrte Damen', 'Sehr verehrte Damen')).toEqual({
      from: 5,
      to: 7,
      insert: 'ver',
    })
  })

  it('meldet eine leere Änderung, wenn sich nichts geändert hat', () => {
    expect(diffText('gleich', 'gleich')).toEqual({ from: 6, to: 6, insert: '' })
  })

  it('kommt mit leerem Ausgangstext und leerem Ergebnis zurecht', () => {
    expect(diffText('', 'neu')).toEqual({ from: 0, to: 0, insert: 'neu' })
    expect(diffText('weg', '')).toEqual({ from: 0, to: 3, insert: '' })
  })

  it('verrechnet sich nicht bei wiederholten Zeichen', () => {
    // Anfang und Ende dürfen sich nicht überlappen, sonst käme eine
    // Änderung mit `from > to` heraus und `replaceRange` würfe.
    const edit = diffText('aaa', 'aa')
    expect(edit.from).toBeLessThanOrEqual(edit.to)
    expect('aaa'.slice(0, edit.from) + edit.insert + 'aaa'.slice(edit.to)).toBe('aa')
  })

  it('beschreibt in jedem Fall genau den Weg vom einen zum anderen Text', () => {
    const samples = ['', 'a', 'ab', 'abc', 'abcd', 'axc', 'abcc', 'cba', 'a\tb\nc']
    for (const before of samples) {
      for (const after of samples) {
        const edit = diffText(before, after)
        expect(edit.from).toBeLessThanOrEqual(edit.to)
        expect(before.slice(0, edit.from) + edit.insert + before.slice(edit.to)).toBe(after)
      }
    }
  })
})

describe('isBlockedInputType', () => {
  it('sperrt jede Formatierung', () => {
    for (const inputType of [
      'formatBold',
      'formatItalic',
      'formatUnderline',
      'formatStrikeThrough',
      'formatFontColor',
      'formatJustifyCenter',
      'formatIndent',
    ]) {
      expect(isBlockedInputType(inputType)).toBe(true)
    }
  })

  it('sperrt alles, was Struktur erzeugt', () => {
    for (const inputType of [
      'insertParagraph',
      'insertLineBreak',
      'insertOrderedList',
      'insertUnorderedList',
      'insertHorizontalRule',
      'insertLink',
      'insertFromDrop',
    ]) {
      expect(isBlockedInputType(inputType)).toBe(true)
    }
  })

  it('lässt Text zu', () => {
    for (const inputType of [
      'insertText',
      'insertCompositionText',
      'insertReplacementText',
      'deleteContentBackward',
      'deleteContentForward',
      'deleteByCut',
      'historyUndo',
    ]) {
      expect(isBlockedInputType(inputType)).toBe(false)
    }
  })
})

describe('isFormattingShortcut', () => {
  const base = { ctrlKey: false, metaKey: false, altKey: false }

  it('erkennt Strg+B, Strg+I und Strg+U', () => {
    for (const key of ['b', 'i', 'u', 'B', 'I', 'U']) {
      expect(isFormattingShortcut({ ...base, key, ctrlKey: true })).toBe(true)
    }
  })

  it('erkennt dieselben Tasten mit der Cmd-Taste', () => {
    expect(isFormattingShortcut({ ...base, key: 'b', metaKey: true })).toBe(true)
  })

  it('lässt gewöhnliche Tasten und andere Kürzel durch', () => {
    expect(isFormattingShortcut({ ...base, key: 'b' })).toBe(false)
    expect(isFormattingShortcut({ ...base, key: 'z', ctrlKey: true })).toBe(false)
    expect(isFormattingShortcut({ ...base, key: 'a', ctrlKey: true })).toBe(false)
    // Alt+Strg+B ist auf mehreren Tastaturen AltGr und tippt ein Zeichen.
    expect(isFormattingShortcut({ ...base, key: 'b', ctrlKey: true, altKey: true })).toBe(false)
  })
})

describe('toPlainTextInsertion', () => {
  it('macht aus Zeilenumbrüchen ein Leerzeichen', () => {
    expect(toPlainTextInsertion('erste Zeile\nzweite Zeile')).toBe('erste Zeile zweite Zeile')
  })

  it('fasst Absatzabstände und Windows-Zeilenenden zusammen', () => {
    expect(toPlainTextInsertion('eins\r\n\r\n  zwei   \n drei')).toBe('eins zwei drei')
  })

  it('lässt Tabulatoren stehen, weil das Modell sie kennt', () => {
    expect(toPlainTextInsertion('Anrede:\tHerr')).toBe('Anrede:\tHerr')
  })

  it('lässt einzeiligen Text unverändert', () => {
    expect(toPlainTextInsertion('nichts zu tun')).toBe('nichts zu tun')
  })
})

describe('insertPlainText', () => {
  function host(text: string): HTMLElement {
    const element = document.createElement('p')
    element.textContent = text
    document.body.append(element)
    return element
  }

  function caretAt(element: HTMLElement, offset: number, endOffset = offset): void {
    const node = element.firstChild
    if (node === null) throw new Error('Kein Textknoten')
    window.getSelection()?.setBaseAndExtent(node, offset, node, endOffset)
  }

  it('fügt an der Einfügestelle ein', () => {
    const element = host('AB')
    caretAt(element, 1)

    expect(insertPlainText(element, 'XY')).toBe(true)
    expect(element.textContent).toBe('AXYB')
  })

  it('ersetzt eine bestehende Markierung', () => {
    const element = host('Anfang Mitte Ende')
    caretAt(element, 7, 12)

    expect(insertPlainText(element, 'Neues')).toBe(true)
    expect(element.textContent).toBe('Anfang Neues Ende')
  })

  it('rührt nichts an, wenn die Einfügestelle in einem anderen Absatz liegt', () => {
    const first = host('Erster')
    const second = host('Zweiter')
    caretAt(second, 2)

    expect(insertPlainText(first, 'X')).toBe(false)
    expect(first.textContent).toBe('Erster')
    expect(second.textContent).toBe('Zweiter')
  })

  it('rührt nichts an, wenn es gar keine Einfügestelle gibt', () => {
    const element = host('Text')
    window.getSelection()?.removeAllRanges()

    expect(insertPlainText(element, 'X')).toBe(false)
    expect(element.textContent).toBe('Text')
  })
})
