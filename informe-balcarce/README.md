# Informe Balcarce — pedido, envío y venta (22 al 29/09)

Página única con el análisis de la sucursal 10 (Balcarce): pedido, envío del
depósito, venta diaria, hueco de 72 horas sin entrega y productos sin stock en
góndola el 29/09. Todo está en `public/index.html` (datos, gráficos en SVG y
estilos); `server.js` sólo la sirve, sin dependencias.

## Probarlo en la computadora

```bash
cd informe-balcarce
npm start
```

Abrí `http://localhost:3000`.

## Publicarlo en Railway

Vive en el mismo repositorio que los otros proyectos, así que en Railway se
agrega como **un servicio más**, con esta carpeta como raíz:

1. En tu proyecto de Railway: **+ New → GitHub Repo** → `juancollins27/Repositorio`.
2. **Settings → Source**: **Root Directory** = `informe-balcarce` y en
   **Branch** la rama a publicar.
3. **Variables** (recomendado, porque el informe tiene datos internos):

   | Variable | Valor | Para qué |
   |---|---|---|
   | `APP_PASSWORD` | una contraseña | pedir contraseña para ver el informe |
   | `APP_USUARIO` | opcional, por defecto `balcarce` | usuario a ingresar |

4. **Settings → Networking → Generate Domain** para obtener la URL pública
   (algo como `informe-balcarce.up.railway.app`).
5. Compartí la URL junto con el usuario y la contraseña.

No necesita volumen: no guarda datos. Para actualizar el informe, reemplazá
`public/index.html` y subí el cambio; Railway lo vuelve a publicar solo.
