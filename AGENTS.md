# Instrucciones para Agentes

Este repositorio contiene **Lalo PDF**, una aplicación de escritorio construida con Electron.

## Verificación y Testing en Windows

Cuando trabajes en un entorno **Windows** (o se te pida validar el estado de la aplicación antes de un commit/release):

1. Lee y ejecuta el checklist completo en [`docs/TESTING.md`](docs/TESTING.md).
2. Presta especial atención a la sección de **Ciclo de vida (Apertura y Cierre en Windows)** para asegurar que la aplicación inicia correctamente, cierra sin errores y no deja procesos residuales (`electron.exe` / `Lalo PDF.exe`) en segundo plano.
3. Reporta explícitamente el resultado de cada bloque (tests automatizados y pruebas de apertura/cierre) indicando la versión probada.
