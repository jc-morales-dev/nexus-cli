import { describe, expect, test } from 'bun:test'

import { getEffectiveAgentMode, isTrivialTask } from '../task-complexity'

describe('isTrivialTask — trivial cases', () => {
  const trivial = [
    'hola bro',
    'que hace app.js',
    '¿cómo funciona este archivo?',
    'crea un archivo hola.js',
    'crea un archivo html simulando una pagina web de barberia elite',
    'creá una página de landing para un gimnasio',
    'renombra el archivo viejo',
    'cambia el color del botón a rojo',
    'explica qué hace esta función',
    'make a simple html file',
  ]
  for (const p of trivial) {
    test(`trivial: ${p}`, () => {
      expect(isTrivialTask(p)).toBe(true)
    })
  }
})

describe('isTrivialTask — non-trivial cases stay MAX', () => {
  const complex = [
    'refactoriza el sistema de autenticación',
    'migra la base de datos a postgres',
    'arregla el bug de login y agrega tests de integración',
    'implementa un sistema de pagos con stripe',
    'optimiza el rendimiento de toda la app',
    'integra la API de mercado pago en el checkout',
    'crea un endpoint REST para los usuarios',
    'rediseña la arquitectura del proyecto',
    // very long prompt → treated as a detailed spec
    'crea ' + 'una pagina '.repeat(60),
  ]
  for (const p of complex) {
    test(`non-trivial: ${p.slice(0, 40)}`, () => {
      expect(isTrivialTask(p)).toBe(false)
    })
  }

  test('empty prompt is not trivial', () => {
    expect(isTrivialTask('')).toBe(false)
    expect(isTrivialTask('   ')).toBe(false)
  })

  test('a prompt with no clear signal stays non-trivial (safe default)', () => {
    expect(isTrivialTask('necesito ayuda con esto por favor')).toBe(false)
  })
})

describe('getEffectiveAgentMode', () => {
  test('downgrades MAX → DEFAULT for a trivial task', () => {
    expect(getEffectiveAgentMode('MAX', 'crea un archivo html')).toBe('DEFAULT')
  })

  test('keeps MAX for a substantial task', () => {
    expect(getEffectiveAgentMode('MAX', 'refactoriza el login')).toBe('MAX')
  })

  test('never touches PLAN (read-only)', () => {
    expect(getEffectiveAgentMode('PLAN', 'crea un archivo html')).toBe('PLAN')
  })

  test('leaves DEFAULT and LITE untouched', () => {
    expect(getEffectiveAgentMode('DEFAULT', 'crea un archivo html')).toBe(
      'DEFAULT',
    )
    expect(getEffectiveAgentMode('LITE', 'refactoriza todo')).toBe('LITE')
  })
})
