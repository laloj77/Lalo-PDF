# Plan de Pruebas — Lalo PDF (`v0.2.0`)

Este documento define las pruebas obligatorias que debe ejecutar un agente (o desarrollador) en **Windows** para validar el estado de la aplicación.

---

## 1. Requisitos previos

- Entorno Windows con Node.js y dependencias instaladas (`npm install`).
- Verificar que no haya instancias previas de la app corriendo antes de empezar:
  ```powershell
  tasklist | findstr /I "electron Lalo"
  ```

---

## 2. Tests Automatizados (E2E)

Ejecutar todos los scripts de test definidos en `package.json` y verificar que todos finalicen con código de salida `0`:

```powershell
npm run test:e2e
npm run test:errors
npm run test:markup
npm run test:shapes
npm run test:drag
npm run test:reorder
npm run test:print
```

- [ ] `test:e2e` (guardado básico)
- [ ] `test:errors` (manejo de errores)
- [ ] `test:markup` (anotaciones)
- [ ] `test:shapes` (formas)
- [ ] `test:drag` (arrastrar y soltar)
- [ ] `test:reorder` (reordenación de páginas)
- [ ] `test:print` (impresión)

---

## 3. Ciclo de Vida en Windows (Apertura y Cierre)

> **Foco crítico:** Comprobar que la aplicación abre de forma limpia y cierra completamente sin dejar procesos colgados ni errores silenciosos.

### 3.1 Arranque en modo desarrollo
1. Ejecutar `npm start`.
2. Verificar que la ventana principal de **Lalo PDF** se abre, renderiza la interfaz sin pantalla en blanco y no muestra errores críticos en consola.
3. Cerrar la aplicación haciendo clic en el botón **X** de la ventana.
4. Verificar que el proceso termina por completo:
   ```powershell
   tasklist | findstr /I "electron"
   ```
   *(No debe quedar ningún proceso activo tras unos segundos).*

### 3.2 Cierre con `Alt + F4` y reapertura
1. Volver a abrir con `npm start`.
2. Abrir o cargar un PDF de prueba.
3. Cerrar la ventana usando `Alt + F4`.
4. Confirmar que no quedan procesos residuales y que al volver a ejecutar `npm start` la app arranca normalmente sin archivos bloqueados ni estado corrupto.

### 3.3 Cierre con múltiples ventanas / diálogos (si aplica)
1. Si se abre un diálogo nativo (abrir/guardar archivo o imprimir), cerrarlo o cancelarlo y luego cerrar la app principal.
2. Confirmar que el proceso de Electron finaliza limpiamente.

---

## 4. Verificación de Build Empaquetado (Opcional / Pre-Release)

Si se va a generar instalador o versión portable para Windows:

```powershell
npm run dist:win
```

- [ ] El build finaliza sin errores en `dist/`.
- [ ] El ejecutable generado abre correctamente en Windows.
- [ ] Al cerrar el ejecutable, no quedan procesos `Lalo PDF.exe` en segundo plano.
