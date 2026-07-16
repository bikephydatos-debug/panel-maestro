
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

function driveSetStatus(person, type, msg, cls) {
  var el = document.getElementById(person + '-drive-' + type + '-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'drive-status' + (cls ? ' ' + cls : '');
}

function driveGetToken(callback) {
  if (driveToken) { callback(driveToken); return; }
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
      callback(driveToken);
    }
  });
  client.requestAccessToken();
}

function driveCargar(person) {
  driveSetStatus(person, 'load', 'Conectando...', '');
  driveGetToken(function(token) {
    var folderId = DRIVE_FOLDER_IDS[person];
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
        driveSetStatus(person, 'load', 'Cargando ' + file.name + '...', '');
        return fetch('https://www.googleapis.com/drive/v3/files/' + file.id + '?alt=media',
          { headers: { Authorization: 'Bearer ' + token } });
      })
      .then(function(r) { return r.json(); })
      .then(function(jsonData) {
        var input = document.getElementById(person + '-json-input');
        if (input) input.value = JSON.stringify(jsonData, null, 2);
        comCargarJSON(person);
        driveSetStatus(person, 'load', 'Cargado desde Drive', 'ok');
      })
      .catch(function(e) {
        driveSetStatus(person, 'load', 'Error al cargar', 'err');
        console.error('Drive cargar error:', e);
      });
  });
}

function driveGuardar(person) {
  var s = comState[person];
  if (!s) { driveSetStatus(person, 'save', 'Sin datos para guardar', 'err'); return; }
  comGuardar(person);
  var data = s.jsonData || {};
  var json = {
    tienda: data.tienda || DRIVE_PERSON_NAMES[person],
    responsable: data.responsable || '',
    periodo: data.periodo || '',
    tipo: data.tipo || '',
    confidencial: true,
    kpis_resumen: data.kpis_resumen || data.kpis || {},
    semaforo_areas: data.semaforo_areas || {},
    kpis_comercial: data.kpis_comercial || [],
    kpis_taller: data.kpis_taller || [],
    vendedores: data.vendedores || [],
    proyeccion: data.proyeccion || {},
    diagnostico: data.diagnostico || {},
    positivos: data.positivos || [],
    negativos: data.negativos || [],
    promociones_activas: data.promociones_activas || {},
    discrepancias: data.discrepancias || [],
    puntos_ciegos: data.puntos_ciegos || [],
    fuentes: data.fuentes || {},
    acciones_confirmadas: (s.acciones || []).filter(function(a){return a.confirmada;}),
    acciones_pendientes: (s.acciones || []).filter(function(a){return !a.confirmada;}),
    seguimiento_acciones: data.seguimiento_acciones || [],
    calidad: { cuestionarios: s.cuestTotal || 0, resenas: s.resenasTotal || 0, personas: s.personasCalidad || [] },
    reunion: {
      energia: s.fields['energia'] || '',
      motivacion: s.fields['motivacion'] || '',
      notas: s.fields['notas-reunion'] || '',
      temp_final: s.fields['temp-final'] || '',
      proxima_reunion: s.fields['proxima-reunion'] || '',
      accion_javi: s.fields['accion-javi'] || ''
    },
    exportado: new Date().toISOString()
  };
  var fileName = (json.tienda + '_' + (json.periodo || new Date().toISOString().split('T')[0])).replace(/\s/g,'_') + '.json';
  var jsonStr = JSON.stringify(json, null, 2);
  driveSetStatus(person, 'save', 'Guardando...', '');
  driveGetToken(function(token) {
    var folderId = DRIVE_FOLDER_IDS[person];
    // Buscar si ya existe para sobreescribir
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
          method = 'PATCH';
        } else {
          url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
          method = 'POST';
        }
        if (existingId) {
          return fetch(url, {
            method: method,
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: jsonStr
          });
        } else {
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
          driveSetStatus(person, 'save', 'Guardado en Drive', 'ok');
          var el = document.getElementById(person + '-estado-guardado');
          if (el) el.textContent = 'Guardado en Drive ' + new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
        } else {
          driveSetStatus(person, 'save', 'Error al guardar', 'err');
          console.error('Drive save error:', result);
        }
      })
      .catch(function(e) {
        driveSetStatus(person, 'save', 'Error al guardar', 'err');
        console.error('Drive guardar error:', e);
      });
  });
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
