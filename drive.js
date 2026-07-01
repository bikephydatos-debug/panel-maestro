// =============================================
// GOOGLE DRIVE INTEGRATION
// =============================================
var DRIVE_CLIENT_ID = '1027909595984-c87ot1qdkputt3ijh579f2rr2g8e80dc.apps.googleusercontent.com';
var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
var DRIVE_FOLDER_IDS = {
  kevin:        '19Ld6YRETlW4xQAjZ9iVDMPUDC5XKJjsF',
  ariel:        '14GZ-KP5r1Onz7zZ99NgPiZ2yHz9FM-R-',
  sergio:       '1ylXRsA4sWSZ5dPeTEofzN41LcU7teF9f',
  alejandro_com:'1fpqMVHXg_KHwThVKIG9ospOpEdNr0-tS'
};
var DRIVE_PERSON_NAMES = {
  kevin: 'Marbella', ariel: 'Malaga', sergio: 'Velez-Malaga', alejandro_com: 'Web'
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
        setTimeout(function(){ renderCampanasEmail(person, jsonData); }, 300);
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

function renderCampanasEmail(person, jsonData) {
  // === CAMPANAS Y PRODUCTOS ===
  var campanas = jsonData.campanas_activas || {};
  var productos = campanas.productos || [];
  var activas = campanas.campanas || [];

  // Buscar contenedor de promociones - el panel tiene una seccion de promociones
  var promoEl = document.getElementById(person + '-promociones-content');
  if (!promoEl) {
    // Crear el contenedor si no existe, dentro de la seccion de promociones
    var promoSection = document.querySelector('#app-' + person + ' [data-tab="promociones"]') ||
                       document.querySelector('#app-' + person + ' .com-tab-content-promociones');
    if (!promoSection) {
      // Buscar la seccion por otro metodo
      var allSections = document.querySelectorAll('#app-' + person + ' .section');
      allSections.forEach(function(s) {
        if (s.id && s.id.indexOf('promo') > -1) promoSection = s;
      });
    }
  }

  // Inyectar en la primera area disponible de promociones
  var promoTarget = document.getElementById(person + '-promociones-box') ||
                    document.getElementById(person + '-promo-box') ||
                    document.querySelector('#app-' + person + ' .com-promo-area');

  var html = '<div style="background:var(--gray-50);border-radius:8px;padding:16px;margin-bottom:12px;">';
  html += '<h4 style="font-size:13px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">🚴 Productos a impulsar</h4>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">';
  productos.forEach(function(p) {
    html += '<span style="background:var(--black);color:var(--lime);border:1px solid var(--lime);border-radius:4px;padding:3px 8px;font-size:11px;font-weight:600;">' + p + '</span>';
  });
  html += '</div>';
  html += '<h4 style="font-size:13px;color:var(--gray-400);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">🔥 Campañas activas</h4>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px;">';
  activas.forEach(function(c) {
    html += '<span style="background:#2a1a00;color:#FFA500;border:1px solid #FFA500;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:600;">' + c + '</span>';
  });
  html += '</div></div>';

  if (promoTarget) {
    promoTarget.innerHTML = html;
  } else {
    // Insertar antes del export bar si no hay contenedor especifico
    var exportBar = document.querySelector('#app-' + person + ' .com-export-bar');
    if (exportBar) {
      var div = document.createElement('div');
      div.id = person + '-campanas-injected';
      div.innerHTML = html;
      exportBar.parentNode.insertBefore(div, exportBar);
    }
  }

  // === EMAIL ===
  var emailData = jsonData.email || {};
  var emailAsunto = emailData.asunto || '';
  var emailCuerpo = emailData.cuerpo || '';

  var asuntoEl = document.getElementById(person + '-email-asunto');
  var cuerpoEl = document.getElementById(person + '-email-cuerpo') ||
                 document.getElementById(person + '-email-preview') ||
                 document.getElementById(person + '-email-texto');

  if (asuntoEl && emailAsunto) asuntoEl.value = emailAsunto;
  if (cuerpoEl && emailCuerpo) {
    if (cuerpoEl.tagName === 'TEXTAREA' || cuerpoEl.tagName === 'INPUT') {
      cuerpoEl.value = emailCuerpo;
    } else {
      cuerpoEl.innerHTML = '<pre style="white-space:pre-wrap;font-family:var(--font-body);font-size:13px;line-height:1.6;">' + emailCuerpo + '</pre>';
    }
  }
}

// =============================================
