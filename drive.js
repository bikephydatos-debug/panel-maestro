
// GOOGLE DRIVE INTEGRATION
// =============================================
var DRIVE_CLIENT_ID = '1027909595984-c87ot1qdkputt3ijh579f2rr2g8e80dc.apps.googleusercontent.com';
var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
var DRIVE_FOLDER_IDS = {
  kevin:        '19Ld6YRETlW4xQAjZ9iVDMPUDC5XKJjsF',
  ariel:        '14GZ-KP5r1Onz7zZ99NgPiZ2yHz9FM-R-',
  sergio:       '1ylXRsA4sWSZ5dPeTEofzN41LcU7teF9f',
  alejandro_com:'1fpqMVHXg_KHwThVKIG9ospOpEdNr0-tS',
  hernan:       '17uBffq4qXjW7gxwKBBAVhNQ_klVXctLW',
  moi:          '1guzNSwIXwDe_TP7ZQsprOm0QhnqvFIb9',
  jesus_roda:   '1nqYTi10ENOKsNCENqWJ5xMCXZDxWtXym',
  alejandro:    '1tIR0VpU31_fliL0mZ4k1-Q2Jb5aiIHyi'
};
var DRIVE_PERSON_NAMES = {
  kevin: 'Marbella', ariel: 'Malaga', sergio: 'Velez-Malaga', alejandro_com: 'Web',
  hernan: 'Hernan', moi: 'Moi', jesus_roda: 'Jesus Roda', alejandro: 'Alejandro'
};
// Personas del sistema de gestion (no comercial) que usan el modelo state/currentPerson
var DRIVE_PERSONA_TIPO = {
  hernan: 'persona', moi: 'persona', jesus_roda: 'persona', alejandro: 'persona'
};
var driveToken = null;
var driveTokenExp = 0;

function driveInvalidarToken() { driveToken = null; driveTokenExp = 0; }

function driveSetStatus(person, type, msg, cls) {
  var el = document.getElementById(person + '-drive-' + type + '-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'drive-status' + (cls ? ' ' + cls : '');
}

function driveGetToken(callback, forzar) {
  if (driveToken && !forzar && Date.now() < driveTokenExp) { callback(driveToken); return; }
  if (DRIVE_CLIENT_ID === 'PENDIENTE_CLIENT_ID') {
    alert('Falta configurar el Client ID de Google. Contacta con el administrador.');
    return;
  }
  var client = google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: function(resp) {
      if (resp.error) { console.error('OAuth error:', resp.error); return; }
      driveToken = resp.access_token;
      driveTokenExp = Date.now() + (((resp.expires_in ? resp.expires_in : 3600) - 300) * 1000);
      callback(driveToken);
    }
  });
  client.requestAccessToken();
}

function driveCargar(person) {
  driveSetStatus(person, 'load', 'Conectando...', '');
  driveGetToken(function(token) {
    var folderId = DRIVE_FOLDER_IDS[person];
    var ficheroCargado = null;
    var url = 'https://www.googleapis.com/drive/v3/files?q=' +
      encodeURIComponent("'" + folderId + "' in parents and mimeType='application/json' and trashed=false") +
      '&orderBy=modifiedTime+desc&pageSize=1&fields=files(id,name,modifiedTime)';
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.files || !data.files.length) {
          driveSetStatus(person, 'load', 'No hay JSON en Drive', 'err'); return;
        }
        var file = data.files[0];
        ficheroCargado = file;
        driveSetStatus(person, 'load', 'Cargando ' + file.name + '...', '');
        return fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media',
          { headers: { Authorization: 'Bearer ' + token } });
      })
      .then(function(r) { return r.json(); })
      .then(function(jsonData) {
        var input = document.getElementById(person + '-json-input');
        if (input) input.value = JSON.stringify(jsonData, null, 2);
        comCargarJSON(person);
        if (comState[person] && ficheroCargado) {
          comState[person].driveFileId = ficheroCargado.id;
          comState[person].driveFileName = ficheroCargado.name;
        }
        driveSetStatus(person, 'load', 'Cargado desde Drive', 'ok');
      })
      .catch(function(e) {
        driveSetStatus(person, 'load', 'Error al cargar', 'err');
        console.error('Drive cargar error:', e);
      });
  });
}

function driveGuardar(person, _reintento) {
  var s = comState[person];
  if (!s) { driveSetStatus(person, 'save', 'Sin datos para guardar', 'err'); return; }
  if (!s.fields) { s.fields = {}; }
  comGuardar(person);

  var data = s.jsonData || {};

  // Partimos de una copia del JSON original para NO perder ningun campo
  // (calidad_encuestas, ventas_campanas_bikephy, periodo_comparativo,
  //  objetivos_calendario_web, etc.) y encima escribimos lo editado en la reunion.
  var json = {};
  for (var k in data) {
    if (Object.prototype.hasOwnProperty.call(data, k)) { json[k] = data[k]; }
  }

  json.tienda = data.tienda || DRIVE_PERSON_NAMES[person];
  json.confidencial = true;

  // Acciones: solo se sobreescriben si el panel tiene alguna cargada
  if (s.acciones && s.acciones.length) {
    json.acciones_confirmadas = s.acciones.filter(function(a){ return a.confirmada; });
    json.acciones_pendientes  = s.acciones.filter(function(a){ return !a.confirmada; });
  }

  json.calidad = { cuestionarios: s.cuestTotal || 0, resenas: s.resenasTotal || 0, personas: s.personasCalidad || [] };

  json.reunion = {
    energia:         s.fields['energia'] || '',
    motivacion:      s.fields['motivacion'] || '',
    notas:           s.fields['notas-reunion'] || '',
    temp_final:      s.fields['temp-final'] || '',
    proxima_reunion: s.fields['proxima-reunion'] || '',
    accion_javi:     s.fields['accion-javi'] || ''
  };
  if (data.reunion) {
    for (var rk in data.reunion) {
      if (Object.prototype.hasOwnProperty.call(data.reunion, rk) && !json.reunion[rk]) {
        json.reunion[rk] = data.reunion[rk];
      }
    }
  }

  if (s.fields['email-body'] !== undefined) { json.email_editado = s.fields['email-body']; }
  else if (data.email_editado) { json.email_editado = data.email_editado; }

  json.exportado = new Date().toISOString();

  var jsonStr = JSON.stringify(json, null, 2);
  var fileName = s.driveFileName ||
    ((json.tienda + '_' + (json.periodo || new Date().toISOString().split('T')[0])).replace(/\s/g,'_') + '.json');

  driveSetStatus(person, 'save', _reintento ? 'Reintentando...' : 'Guardando...', '');

  driveGetToken(function(token) {
    var folderId = DRIVE_FOLDER_IDS[person];

    function comprobar401(r) {
      if (r.status === 401 || r.status === 403) { var e = new Error('auth'); e.code = 401; throw e; }
      return r;
    }

    function subir(existingId) {
      if (existingId) {
        return fetch('https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=media', {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: jsonStr
        });
      }
      var meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'application/json' });
      var boundary = 'bikephy_boundary';
      var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
        '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + jsonStr + '\r\n--' + boundary + '--';
      return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: body
      });
    }

    // Si sabemos sobre que fichero trabajamos, lo sobreescribimos directamente
    var localizar;
    if (s.driveFileId) {
      localizar = Promise.resolve(s.driveFileId);
    } else {
      var searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' +
        encodeURIComponent("'" + folderId + "' in parents and name='" + fileName + "' and trashed=false") +
        '&fields=files(id)';
      localizar = fetch(searchUrl, { headers: { Authorization: 'Bearer ' + token } })
        .then(comprobar401)
        .then(function(r) { return r.json(); })
        .then(function(res) { return (res.files && res.files.length) ? res.files[0].id : null; });
    }

    localizar
      .then(subir)
      .then(comprobar401)
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result && result.id) {
          s.driveFileId = result.id;
          s.driveFileName = fileName;
          comSaveStateObj(person);
          driveSetStatus(person, 'save', 'Guardado en Drive', 'ok');
          var el = document.getElementById(person + '-estado-guardado');
          if (el) el.textContent = 'Guardado en Drive ' + new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
        } else {
          driveSetStatus(person, 'save', 'Error al guardar', 'err');
          console.error('Drive save error:', result);
        }
      })
      .catch(function(e) {
        if (e && e.code === 401 && !_reintento) {
          driveInvalidarToken();
          driveGuardar(person, true);
          return;
        }
        driveSetStatus(person, 'save', 'Error al guardar', 'err');
        console.error('Drive guardar error:', e);
      });
  }, _reintento === true);
}


function personaDriveSetStatus(msg, cls) {
  var el = document.getElementById('persona-drive-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'drive-status' + (cls ? ' ' + cls : '');
}

// =============================================
// DRIVE PARA GESTION DE PERSONAS (Hernan, Moi, Jesus Roda, Alejandro)
// Usa el mismo token OAuth (driveGetToken) pero opera sobre el modelo
// state / currentPerson en vez de comState, y reutiliza procesarJSONCargado()
// definida en panel.html para no duplicar la logica de loadJSON().
// =============================================

function personaDriveGuardar(person) {
  if (typeof state === 'undefined' || !state.meta) {
    personaDriveSetStatus('Sin datos para guardar', 'err'); return;
  }
  var data = {
    persona: person,
    rol: state.meta.rol,
    fecha: state.meta.fecha,
    fecha_exportacion: new Date().toISOString(),
    fields: state.fields,
    pills: state.pills,
    compromisos: state.commitments,
    eventos: state.eventos || [],
    history: state.history,
    confidencial: true
  };
  var fileName = ('reunion_' + person + '_' + state.meta.fecha).replace(/\s/g, '_') + '.json';
  var jsonStr = JSON.stringify(data, null, 2);
  personaDriveSetStatus('Guardando...', '');
  driveGetToken(function(token) {
    var folderId = DRIVE_FOLDER_IDS[person];
    var searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' +
      encodeURIComponent("'" + folderId + "' in parents and name='" + fileName + "' and trashed=false") +
      '&fields=files(id)';
    fetch(searchUrl, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        var existingId = res.files && res.files.length ? res.files[0].id : null;
        var url, method;
        if (existingId) {
          url = 'https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=media';
          return fetch(url, {
            method: 'PATCH',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: jsonStr
          });
        } else {
          url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
          var meta = JSON.stringify({ name: fileName, parents: [folderId] });
          var boundary = 'bikephy_boundary';
          var body = '--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + meta +
            '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + jsonStr + '\r\n--' + boundary + '--';
          return fetch(url, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
            body: body
          });
        }
      })
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result.id) {
          personaDriveSetStatus('Guardado en Drive', 'ok');
        } else {
          personaDriveSetStatus('Error al guardar', 'err');
          console.error('Drive guardar error (persona):', result);
        }
      })
      .catch(function(e) {
        personaDriveSetStatus('Error al guardar', 'err');
        console.error('Drive guardar error (persona):', e);
      });
  });
}

function personaDriveCargar(person) {
  personaDriveSetStatus('Conectando...', '');
  driveGetToken(function(token) {
    var folderId = DRIVE_FOLDER_IDS[person];
    var url = 'https://www.googleapis.com/drive/v3/files?q=' +
      encodeURIComponent("'" + folderId + "' in parents and mimeType='application/json' and trashed=false") +
      '&orderBy=modifiedTime+desc&pageSize=1&fields=files(id,name,modifiedTime)';
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.files || !data.files.length) {
          personaDriveSetStatus('No hay JSON en Drive', 'err'); return;
        }
        var file = data.files[0];
        personaDriveSetStatus('Cargando ' + file.name + '...', '');
        return fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media',
          { headers: { Authorization: 'Bearer ' + token } });
      })
      .then(function(r) { return r ? r.json() : null; })
      .then(function(jsonData) {
        if (!jsonData) return;
        if (typeof procesarJSONCargado === 'function') {
          procesarJSONCargado(jsonData);
          personaDriveSetStatus('Cargado desde Drive', 'ok');
        } else {
          personaDriveSetStatus('Error: falta procesarJSONCargado()', 'err');
        }
      })
      .catch(function(e) {
        personaDriveSetStatus('Error al cargar', 'err');
        console.error('Drive cargar error (persona):', e);
      });
  });
}

// =============================================
function renderCampanasEmail(person, jsonData) {
  // === CAMPANAS Y PRODUCTOS ===
  var campanas = jsonData.campanas_activas || {};
  var productos = campanas.productos || [];
  var activas = campanas.campanas || [];

  var prodEl = document.getElementById(person + '-promo-productos');
  var campEl = document.getElementById(person + '-promo-campanas');

  if (prodEl && productos.length) {
    prodEl.innerHTML = productos.map(function(p) {
      return '<div style="background:var(--black);border:1px solid var(--lime);border-radius:6px;padding:10px 14px;color:var(--lime);font-size:12px;font-weight:700;">' + p + '</div>';
    }).join('');
  }

  if (campEl && activas.length) {
    campEl.innerHTML = activas.map(function(c) {
      return '<div style="background:#1a0f00;border:1px solid #FFA500;border-radius:6px;padding:10px 14px;color:#FFA500;font-size:12px;font-weight:700;">🔥 ' + c + '</div>';
    }).join('');
  }

  // === EMAIL ===
  // El email se genera cuando el usuario pulsa "Generar email"
  // No precargamos el cuerpo del JSON para que siempre se genere fresco
  var emailData = jsonData.email || {};
  var emailAsunto = emailData.asunto || '';

  // Si hay asunto, buscarlo y rellenarlo
  var asuntoEl = document.getElementById(person + '-email-subject') ||
                 document.getElementById(person + '-email-asunto') ||
                 document.querySelector('#app-' + person + ' input[placeholder*="sunto"]') ||
                 document.querySelector('#app-' + person + ' input[placeholder*="Asunto"]');
  if (asuntoEl && emailAsunto) {
    asuntoEl.value = emailAsunto;
  }
}

// =============================================


// =============================================
// DRIVE PARA LA VISTA DE GRUPO  (bloque anadido)
// No modifica driveCargar ni driveGuardar de las tiendas.
// Reutiliza driveGetToken y opera sobre su propio estado grupoState.
// =============================================
var GRUPO_DRIVE_FOLDER_ID = '1TMNHGHAHTlfMMQiZlcsiAkwozp0ZXEQI';
var GRUPO_STORAGE_KEY = 'bikephy_grupo_v1';

var grupoState = (function() {
  try {
    var raw = localStorage.getItem(GRUPO_STORAGE_KEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        if (!s.jsonData) s.jsonData = {};
        if (!s.fields) s.fields = {};
        return s;
      }
    }
  } catch(e) {}
  return { jsonData: {}, fields: {}, driveFileId: null, driveFileName: null };
})();
window.grupoState = grupoState;

function grupoGuardarLocal() {
  try { localStorage.setItem(GRUPO_STORAGE_KEY, JSON.stringify(grupoState)); } catch(e) {}
}

function grupoDriveSetStatus(tipo, msg, cls) {
  var el = document.getElementById('grupo-drive-' + tipo + '-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'drive-status' + (cls ? ' ' + cls : '');
}

function grupoFmtEurLocal(v) {
  if (v === null || v === undefined || isNaN(v)) return '--';
  return Math.round(v).toLocaleString('es-ES') + ' EUR';
}

function grupoCapturarCampos() {
  ['notas', 'accion-javi', 'email-body'].forEach(function(f) {
    var el = document.getElementById('grupo-' + f);
    if (el) grupoState.fields[f] = el.value;
  });
  grupoGuardarLocal();
}

function grupoRenderInforme() {
  var d = grupoState.jsonData || {};
  var box = document.getElementById('grupo-informe-box');
  if (!box) return;
  if (!d.periodo && !d.kpis_resumen) { box.style.display = 'none'; return; }
  box.style.display = 'block';

  var meta = document.getElementById('grupo-informe-meta');
  if (meta) {
    meta.innerHTML = '<strong>' + (d.periodo || '--') + '</strong>' +
      (d.periodo_comparativo ? ' &middot; vs ' + d.periodo_comparativo : '') +
      (d.tipo ? ' &middot; ' + d.tipo : '') +
      (grupoState.driveFileName ? '<div style="font-size:11px;color:#999;margin-top:4px">Fichero: ' + grupoState.driveFileName + '</div>' : '');
  }

  var kr = d.kpis_resumen || {};
  var proy = d.proyeccion || {};
  var grid = document.getElementById('grupo-informe-kpis');
  if (grid) {
    grid.innerHTML = [
      { label: 'Cobros', value: grupoFmtEurLocal(kr.cobros_eur) },
      { label: 'Objetivo del mes', value: grupoFmtEurLocal(proy.objetivo_eur) },
      { label: '% sobre prorrateado', value: (kr.cobros_vs_objetivo_pct !== undefined && kr.cobros_vs_objetivo_pct !== null) ? kr.cobros_vs_objetivo_pct + '%' : '--' },
      { label: 'Proyeccion fin de mes', value: grupoFmtEurLocal(kr.proyeccion_fin_mes_eur) },
      { label: 'Ratio conversion', value: (kr.ratio_conversion_pct !== undefined && kr.ratio_conversion_pct !== null) ? kr.ratio_conversion_pct + '%' : '--' },
      { label: 'Ratio llamadas', value: (kr.ratio_llamadas_pct !== undefined && kr.ratio_llamadas_pct !== null) ? kr.ratio_llamadas_pct + '%' : '--' },
      { label: 'Negocio mes siguiente', value: grupoFmtEurLocal(kr.negocio_mes_siguiente_eur) },
      { label: 'Semaforo', value: (kr.semaforo || '--').toUpperCase() }
    ].map(function(k) {
      return '<div class="grupo-kpi-box"><div class="grupo-kpi-label">' + k.label + '</div><div class="grupo-kpi-value">' + k.value + '</div></div>';
    }).join('');
  }

  var diag = document.getElementById('grupo-diagnostico');
  if (diag) {
    var g = d.diagnostico || {};
    var partes = [
      ['Resumen ejecutivo', g.resumen_ejecutivo],
      ['Causa raiz comercial', g.causa_raiz_comercial],
      ['Causa raiz taller', g.causa_raiz_taller],
      ['Patron respecto a periodos anteriores', g.patron_semanas_anteriores],
      ['Riesgo principal', g.riesgo_principal]
    ].filter(function(p) { return p[1]; });
    diag.innerHTML = partes.length
      ? partes.map(function(p) {
          return '<div style="margin-bottom:12px"><div style="font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#777;margin-bottom:4px">' + p[0] + '</div><div style="font-size:13px;line-height:1.6;color:#333">' + p[1] + '</div></div>';
        }).join('')
      : '<div style="color:#999;font-style:italic">Sin diagnostico en el JSON.</div>';
  }

  ['notas', 'accion-javi', 'email-body'].forEach(function(f) {
    var el = document.getElementById('grupo-' + f);
    if (!el) return;
    if (grupoState.fields[f] !== undefined && grupoState.fields[f] !== '') { el.value = grupoState.fields[f]; return; }
    if (f === 'email-body' && d.email_editado) { el.value = d.email_editado; return; }
    var r = d.reunion || {};
    if (f === 'notas' && r.notas) { el.value = r.notas; return; }
    if (f === 'accion-javi' && r.accion_javi) { el.value = r.accion_javi; return; }
  });
}

function grupoDriveCargar() {
  grupoDriveSetStatus('load', 'Conectando...', '');
  driveGetToken(function(token) {
    var ficheroCargado = null;
    var url = 'https://www.googleapis.com/drive/v3/files?q=' +
      encodeURIComponent("'" + GRUPO_DRIVE_FOLDER_ID + "' in parents and mimeType='application/json' and name contains 'grupo' and trashed=false") +
      '&orderBy=modifiedTime+desc&pageSize=1&fields=files(id,name,modifiedTime)';
    fetch(url, { headers: { Authorization: 'Bearer ' + token } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.files || !data.files.length) {
          grupoDriveSetStatus('load', 'No hay JSON de Grupo en Drive', 'err'); return null;
        }
        ficheroCargado = data.files[0];
        grupoDriveSetStatus('load', 'Cargando ' + ficheroCargado.name + '...', '');
        return fetch('https://www.googleapis.com/drive/v3/files/' + ficheroCargado.id + '?alt=media',
          { headers: { Authorization: 'Bearer ' + token } });
      })
      .then(function(r) { return r ? r.json() : null; })
      .then(function(jsonData) {
        if (!jsonData) return;
        grupoState.jsonData = jsonData;
        grupoState.driveFileId = ficheroCargado.id;
        grupoState.driveFileName = ficheroCargado.name;
        grupoState.fields = {};
        grupoGuardarLocal();
        grupoRenderInforme();
        grupoDriveSetStatus('load', 'Cargado desde Drive', 'ok');
      })
      .catch(function(e) {
        grupoDriveSetStatus('load', 'Error al cargar', 'err');
        console.error('Grupo Drive cargar error:', e);
      });
  });
}

function grupoDriveGuardar(_reintento) {
  var d = grupoState.jsonData || {};
  if (!d.periodo && !d.kpis_resumen) {
    grupoDriveSetStatus('save', 'Sin informe cargado', 'err'); return;
  }
  grupoCapturarCampos();

  var json = {};
  for (var k in d) {
    if (Object.prototype.hasOwnProperty.call(d, k)) { json[k] = d[k]; }
  }
  json.tienda = d.tienda || 'Grupo';
  json.confidencial = true;

  json.reunion = {};
  if (d.reunion) {
    for (var rk in d.reunion) {
      if (Object.prototype.hasOwnProperty.call(d.reunion, rk)) { json.reunion[rk] = d.reunion[rk]; }
    }
  }
  if (grupoState.fields['notas'] !== undefined) { json.reunion.notas = grupoState.fields['notas']; }
  if (grupoState.fields['accion-javi'] !== undefined) { json.reunion.accion_javi = grupoState.fields['accion-javi']; }
  if (grupoState.fields['email-body'] !== undefined) { json.email_editado = grupoState.fields['email-body']; }

  json.exportado = new Date().toISOString();

  var jsonStr = JSON.stringify(json, null, 2);
  var fileName = grupoState.driveFileName ||
    ('grupo_' + (json.periodo || new Date().toISOString().split('T')[0])).replace(/\s/g, '_') + '.json';

  grupoDriveSetStatus('save', _reintento ? 'Reintentando...' : 'Guardando...', '');

  driveGetToken(function(token) {
    function comprobar401(r) {
      if (r.status === 401 || r.status === 403) { var e = new Error('auth'); e.code = 401; throw e; }
      return r;
    }
    function subir(existingId) {
      if (existingId) {
        return fetch('https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=media', {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: jsonStr
        });
      }
      var meta = JSON.stringify({ name: fileName, parents: [GRUPO_DRIVE_FOLDER_ID], mimeType: 'application/json' });
      var boundary = 'bikephy_boundary';
      var body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + meta +
        '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' + jsonStr + '\r\n--' + boundary + '--';
      return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: body
      });
    }

    var localizar;
    if (grupoState.driveFileId) {
      localizar = Promise.resolve(grupoState.driveFileId);
    } else {
      var searchUrl = 'https://www.googleapis.com/drive/v3/files?q=' +
        encodeURIComponent("'" + GRUPO_DRIVE_FOLDER_ID + "' in parents and name='" + fileName + "' and trashed=false") +
        '&fields=files(id)';
      localizar = fetch(searchUrl, { headers: { Authorization: 'Bearer ' + token } })
        .then(comprobar401)
        .then(function(r) { return r.json(); })
        .then(function(res) { return (res.files && res.files.length) ? res.files[0].id : null; });
    }

    localizar
      .then(subir)
      .then(comprobar401)
      .then(function(r) { return r.json(); })
      .then(function(result) {
        if (result && result.id) {
          grupoState.driveFileId = result.id;
          grupoState.driveFileName = fileName;
          grupoGuardarLocal();
          grupoDriveSetStatus('save', 'Guardado en Drive', 'ok');
        } else {
          grupoDriveSetStatus('save', 'Error al guardar', 'err');
          console.error('Grupo Drive save error:', result);
        }
      })
      .catch(function(e) {
        if (e && e.code === 401 && !_reintento) {
          driveInvalidarToken();
          grupoDriveGuardar(true);
          return;
        }
        grupoDriveSetStatus('save', 'Error al guardar', 'err');
        console.error('Grupo Drive guardar error:', e);
      });
  }, _reintento === true);
}

// Al abrir la vista de Grupo, restaurar el informe cargado.
// Se engancha en window load para no depender del orden de scripts.
window.addEventListener('load', function() {
  if (typeof abrirVistaGrupo === 'function') {
    var _origAbrirVistaGrupo = abrirVistaGrupo;
    abrirVistaGrupo = function() { _origAbrirVistaGrupo(); try { grupoRenderInforme(); } catch(e) {} };
  }
});
