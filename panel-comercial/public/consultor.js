// Pestaña Consultor IA: chat con el agente de /api/asistente.
// Usa la función api() de app.js.

(function () {
  const chat = document.getElementById('cs-chat');
  const entrada = document.getElementById('cs-mensaje');
  const enviar = document.getElementById('cs-enviar');
  const aviso = document.getElementById('cs-aviso');
  const sugerencias = document.getElementById('cs-sugerencias');
  let conversacionId = null;
  let ocupado = false;

  const NOMBRES_HERRAMIENTAS = {
    ver_sucursales: 'sucursales',
    ver_productividad_resumen: 'productividad',
    ver_productividad_mensual: 'productividad mensual',
    ver_quiebres_lista: 'quiebres',
    ver_quiebres_detalle: 'detalle de quiebres',
    ver_plantel_resumen: 'plantel',
    ver_huecos_cobertura: 'huecos de cobertura',
    ver_cobertura_horaria: 'cobertura horaria',
    ver_plantel_vs_productividad: 'plantel vs. productividad',
    ver_dashboard_ventas: 'ventas'
  };

  // ---------- Markdown mínimo (títulos, listas, tablas, negrita) ----------

  function escapar(texto) {
    return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function enLinea(texto) {
    return escapar(texto)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
      .replace(/(^|\W)_([^_\s][^_]*?)_(?=\W|$)/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  }

  function celdas(fila) {
    return fila.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }

  function markdown(texto) {
    const lineas = texto.split('\n');
    const html = [];
    let i = 0;
    while (i < lineas.length) {
      const linea = lineas[i];
      if (!linea.trim()) { i++; continue; }

      const titulo = linea.match(/^(#{1,4})\s+(.*)$/);
      if (titulo) {
        const nivel = Math.min(titulo[1].length + 2, 5);
        html.push(`<h${nivel}>${enLinea(titulo[2])}</h${nivel}>`);
        i++;
        continue;
      }

      if (/^\s*\|/.test(linea) && i + 1 < lineas.length && /^\s*\|?\s*:?-{2,}/.test(lineas[i + 1])) {
        const encabezado = celdas(linea);
        i += 2;
        const filas = [];
        while (i < lineas.length && /^\s*\|/.test(lineas[i])) filas.push(celdas(lineas[i++]));
        html.push(
          '<div class="cs-tabla"><table><thead><tr>' +
            encabezado.map((c) => `<th>${enLinea(c)}</th>`).join('') +
            '</tr></thead><tbody>' +
            filas.map((f) => '<tr>' + f.map((c) => `<td>${enLinea(c)}</td>`).join('') + '</tr>').join('') +
            '</tbody></table></div>'
        );
        continue;
      }

      const item = /^\s*([-*]|\d+[.)])\s+/;
      if (item.test(linea)) {
        const ordenada = /^\s*\d/.test(linea);
        const items = [];
        while (i < lineas.length && item.test(lineas[i])) items.push(lineas[i++].replace(item, ''));
        const tag = ordenada ? 'ol' : 'ul';
        html.push(`<${tag}>` + items.map((t) => `<li>${enLinea(t)}</li>`).join('') + `</${tag}>`);
        continue;
      }

      if (/^-{3,}$/.test(linea.trim())) { html.push('<hr>'); i++; continue; }

      const parrafo = [];
      while (i < lineas.length && lineas[i].trim() && !/^(#{1,4}\s|\s*\||\s*([-*]|\d+[.)])\s)/.test(lineas[i])) {
        parrafo.push(lineas[i++]);
      }
      if (!parrafo.length) parrafo.push(lineas[i++]);
      html.push(`<p>${parrafo.map(enLinea).join('<br>')}</p>`);
    }
    return html.join('');
  }

  // ---------- chat ----------

  function agregar(clase, html) {
    const div = document.createElement('div');
    div.className = `cs-msg ${clase}`;
    div.innerHTML = html;
    chat.appendChild(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return div;
  }

  async function consultar(texto) {
    texto = texto.trim();
    if (!texto || ocupado) return;
    ocupado = true;
    enviar.disabled = true;
    sugerencias.hidden = true;
    entrada.value = '';
    agregar('cs-usuario', `<p>${escapar(texto).replace(/\n/g, '<br>')}</p>`);
    const pensando = agregar('cs-agente cs-pensando', '<p>Analizando los datos…</p>');
    try {
      const r = await api('/api/asistente', {
        method: 'POST',
        body: JSON.stringify({ mensaje: texto, conversacionId })
      });
      conversacionId = r.conversacionId;
      pensando.remove();
      const fuentes = [...new Set(r.herramientas.map((h) => NOMBRES_HERRAMIENTAS[h] || h))];
      const pie = fuentes.length ? `<p class="cs-fuentes">Datos consultados: ${escapar(fuentes.join(' · '))}</p>` : '';
      agregar('cs-agente', markdown(r.respuesta || '(sin respuesta)') + pie);
    } catch (err) {
      pensando.remove();
      agregar('cs-agente cs-error', `<p>${escapar(err.message)}</p>`);
    } finally {
      ocupado = false;
      enviar.disabled = false;
      entrada.focus();
    }
  }

  enviar.addEventListener('click', () => consultar(entrada.value));
  entrada.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      consultar(entrada.value);
    }
  });
  sugerencias.addEventListener('click', (e) => {
    if (e.target.classList.contains('cs-sugerencia')) consultar(e.target.textContent);
  });
  document.getElementById('cs-nueva').addEventListener('click', () => {
    if (ocupado) return;
    conversacionId = null;
    chat.innerHTML = '';
    sugerencias.hidden = false;
    entrada.focus();
  });

  api('/api/asistente/estado')
    .then((estado) => {
      if (!estado.configurado) {
        aviso.hidden = false;
        aviso.textContent = 'El consultor no está activo: falta configurar la variable ANTHROPIC_API_KEY en el servidor.';
      }
    })
    .catch(() => {});
})();
