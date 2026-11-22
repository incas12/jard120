'use strict';
{
const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESES_L = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const ATIV = [['sementeira','Sementeira'],['plantacao','Plantação'],['poda','Poda'],['adubacao','Adubação']];
const ORIGENS = ['Nativa','Endémica','Exótica','Naturalizada','Invasora','Cultivar/híbrido','Desconhecida'];
const VAZIO_MESES = () => ({sementeira:[],plantacao:[],poda:[],adubacao:[]});

const ICON = {
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 4v10M7 10l5 5 5-5M5 20h14"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  leaf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 10 10 5 20 4c0 9-5 15-13 15H5z"/><path d="M5 19c3-5 6-8 10-10"/></svg>'
};

const $ = s => document.querySelector(s);
const app = $('#app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const byName = (a, b) => (a.nomeComum || '').localeCompare(b.nomeComum || '', 'pt', {sensitivity:'base'});
const fmtData = d => d ? d.split('-').reverse().join('/') : '';

/* ---------- Base de dados (IndexedDB) ---------- */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('jardim', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('especies', {keyPath:'id'});
      d.createObjectStore('variedades', {keyPath:'id'}).createIndex('especieId', 'especieId');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function run(stores, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(stores, 'readwrite');
    let out;
    Promise.resolve(fn(t)).then(v => out = v);
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const S = {esp: [], vars: []};
async function load() {
  const t = db.transaction(['especies','variedades'], 'readonly');
  S.esp = await reqP(t.objectStore('especies').getAll());
  S.vars = await reqP(t.objectStore('variedades').getAll());
  S.esp.sort(byName);
}
const putEsp = o => run(['especies'], t => { t.objectStore('especies').put(o); });
const putVar = o => run(['variedades'], t => { t.objectStore('variedades').put(o); });
const delVar = id => run(['variedades'], t => { t.objectStore('variedades').delete(id); });
const delEsp = id => run(['especies','variedades'], t => {
  t.objectStore('especies').delete(id);
  S.vars.filter(v => v.especieId === id).forEach(v => t.objectStore('variedades').delete(v.id));
});
const varsDe = id => S.vars.filter(v => v.especieId === id)
  .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt', {sensitivity:'base'}));
const totalDe = id => varsDe(id).reduce((s, v) => s + (Number(v.numero) || 0), 0);

/* ---------- Fotos ---------- */
const urls = new WeakMap();
function url(blob) {
  if (!blob) return '';
  if (!urls.has(blob)) urls.set(blob, URL.createObjectURL(blob));
  return urls.get(blob);
}
const img = (blob, cls = 'thumb') => blob
  ? `<img class="${cls}" src="${url(blob)}" alt="" loading="lazy">`
  : `<div class="${cls} ph">${ICON.leaf}</div>`;

async function reduzir(file, max) {
  let src;
  try { src = await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w0 = src.width, h0 = src.height, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}
async function prepararFoto(file) {
  return {foto: await reduzir(file, 1400), mini: await reduzir(file, 300)};
}

/* ---------- UI comum ---------- */
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.append(t);
  setTimeout(() => t.remove(), 2400);
}
function confirmar(msg, sim = 'Apagar') {
  const d = $('#dlg');
  $('#dlgMsg').textContent = msg;
  $('#dlgYes').textContent = sim;
  return new Promise(res => {
    const fim = v => { d.close(); $('#dlgYes').onclick = $('#dlgNo').onclick = null; res(v); };
    $('#dlgYes').onclick = () => fim(true);
    $('#dlgNo').onclick = () => fim(false);
    d.oncancel = () => fim(false);
    d.showModal();
  });
}
function header(title, back, actHtml = '') {
  $('#title').textContent = title;
  $('#back').hidden = !back;
  $('#hact').innerHTML = actHtml;
  document.title = title === 'O Meu Jardim' ? title : title + ' · O Meu Jardim';
}
$('#back').onclick = voltar;
function voltar() {
  if (history.state && history.state.interno) history.back();
  else substituir('#');
}
function ir(hash) { history.pushState({interno:true}, '', hash); route(); }
function substituir(hash) { history.replaceState(history.state, '', hash); route(); }
document.addEventListener('click', e => {
  const a = e.target.closest('a[data-go]');
  if (a) { e.preventDefault(); ir(a.getAttribute('href')); }
});

/* ---------- Lista ---------- */
let filtro = '';
function vLista() {
  header('O Meu Jardim', false, `<a class="ib" href="#dados" data-go aria-label="Importar, exportar e cópias">${ICON.menu}</a>`);
  const m = new Date().getMonth() + 1;
  const tarefas = ATIV.map(([k, n]) => [n, S.esp.filter(e => (e.meses?.[k] || []).includes(m)).map(e => e.nomeComum)]).filter(x => x[1].length);
  const totalPl = S.vars.reduce((s, v) => s + (Number(v.numero) || 0), 0);
  app.innerHTML = S.esp.length ? `
    <input class="search" id="q" type="search" placeholder="Procurar planta, família, variedade…" value="${esc(filtro)}" aria-label="Procurar">
    ${tarefas.length ? `<div class="mes"><h2>Em ${MESES_L[m - 1].toLowerCase()}</h2>${tarefas.map(([n, l]) => `<p><b>${n}:</b> ${l.map(esc).join(', ')}</p>`).join('')}</div>` : ''}
    <p class="count" id="cnt"></p>
    <div class="list" id="lst"></div>`
  : `<div class="empty">${ICON.leaf}<p><b>Ainda não tens plantas.</b><br>Carrega em + para adicionar a primeira.</p></div>`;
  app.insertAdjacentHTML('beforeend', `<a class="fab" href="#nova" data-go aria-label="Adicionar planta">${ICON.plus}</a>`);
  if (!S.esp.length) return;
  const desenhar = () => {
    const q = filtro.trim().toLocaleLowerCase('pt').normalize('NFD').replace(/\p{M}/gu, '');
    const norm = s => (s || '').toLocaleLowerCase('pt').normalize('NFD').replace(/\p{M}/gu, '');
    const lista = S.esp.filter(e => !q || [e.nomeComum, e.nomeCientifico, e.familia, e.genero, e.origem, ...varsDe(e.id).map(v => v.nome)].some(x => norm(x).includes(q)));
    $('#cnt').textContent = q ? `${lista.length} de ${S.esp.length} espécies` : `${S.esp.length} espécies · ${S.vars.length} variedades · ${totalPl} plantas`;
    $('#lst').innerHTML = lista.map(e => {
      const vs = varsDe(e.id), tot = totalDe(e.id);
      const foto = e.mini || vs.find(v => v.mini)?.mini;
      const nomesVar = vs.map(v => v.nome).filter(Boolean);
      return `<a class="item" href="#e/${e.id}" data-go>${img(foto)}<div class="t"><h3>${esc(e.nomeComum)}</h3>
        ${e.nomeCientifico ? `<div class="sci">${esc(e.nomeCientifico)}</div>` : ''}
        <div class="meta">${nomesVar.length ? `${nomesVar.length} ${nomesVar.length === 1 ? 'variedade' : 'variedades'} · ` : ''}${tot} ${tot === 1 ? 'planta' : 'plantas'}</div></div></a>`;
    }).join('') || '<p class="empty">Nenhuma planta encontrada.</p>';
  };
  $('#q').oninput = e => { filtro = e.target.value; desenhar(); };
  desenhar();
}

/* ---------- Detalhe da espécie ---------- */
function calendario(meses) {
  const now = new Date().getMonth() + 1;
  const ativos = ATIV.filter(([k]) => (meses?.[k] || []).length);
  if (!ativos.length) return '<p class="hint">Sem épocas definidas. Edita a planta para as acrescentar.</p>';
  return `<table class="cal"><thead><tr><th></th>${MESES.map((n, i) => `<th class="${i + 1 === now ? 'now' : ''}">${n[0]}</th>`).join('')}</tr></thead><tbody>
    ${ativos.map(([k, n]) => `<tr><td class="l">${n}</td>${MESES.map((_, i) => `<td class="m ${i + 1 === now ? 'now' : ''}" ${(meses[k] || []).includes(i + 1) ? `style="background:var(--c-${k})"` : ''} title="${n} · ${MESES_L[i]}"></td>`).join('')}</tr>`).join('')}
  </tbody></table>
  <div class="legend">${ativos.map(([k, n]) => `<span><i class="dot" style="--ac:var(--c-${k})"></i>${n}: ${(meses[k]).map(m => MESES[m - 1]).join(', ')}</span>`).join('')}</div>`;
}
function vEspecie(id) {
  const e = S.esp.find(x => x.id === id);
  if (!e) return substituir('#');
  header(e.nomeComum, true, `<a class="ib" href="#e/${id}/editar" data-go aria-label="Editar">${ICON.edit}</a>`);
  const vs = varsDe(id), tot = totalDe(id);
  const foto = e.foto || vs.find(v => v.foto)?.foto;
  app.innerHTML = `<div class="dt">${img(foto, 'hero')}
    <h2>${esc(e.nomeComum)}</h2>${e.nomeCientifico ? `<div class="sci">${esc(e.nomeCientifico)}</div>` : ''}
    <div class="chips">
      ${e.familia ? `<span class="chip"><small>Família</small> ${esc(e.familia)}</span>` : ''}
      ${e.genero ? `<span class="chip"><small>Género</small> <i>${esc(e.genero)}</i></span>` : ''}
      ${e.origem ? `<span class="chip"><small>Origem</small> ${esc(e.origem)}</span>` : ''}
      <span class="chip"><small>Total</small> ${tot} ${tot === 1 ? 'planta' : 'plantas'}</span>
    </div>
    <section class="box"><h3>Variedades <a class="btn sm" href="#e/${id}/var" data-go>${ICON.plus.replace('<svg', '<svg width="18" height="18"')} Adicionar</a></h3>
      ${vs.length ? vs.map(v => `<a class="var" href="#v/${v.id}" data-go>${img(v.mini || e.mini)}<div><b>${esc(v.nome || 'Sem variedade indicada')}</b>
        <span class="meta">${v.dataAquisicao ? 'Adquirida a ' + fmtData(v.dataAquisicao) : 'Data de aquisição não indicada'}</span></div>
        <div class="num">${Number(v.numero) || 0}<small>${Number(v.numero) === 1 ? 'planta' : 'plantas'}</small></div></a>`).join('')
      : '<p class="hint">Ainda sem registos. Adiciona uma variedade (ou um registo sem nome de variedade) para indicar número e data de aquisição.</p>'}
    </section>
    <section class="box"><h3>Calendário</h3>${calendario(e.meses)}</section>
    ${e.notas ? `<section class="box"><h3>Notas</h3><p class="notes">${esc(e.notas)}</p></section>` : ''}
  </div>`;
}

/* ---------- Formulários ---------- */
function campoFoto(blob) {
  return `<div class="photo"><span id="fprev">${img(blob)}</span><div>
    <label class="btn sm" for="ffoto" style="margin:0">${blob ? 'Mudar foto' : 'Tirar / escolher foto'}</label>
    ${blob ? '<button type="button" class="btn sm dan" id="frem" style="margin-top:6px">Remover</button>' : ''}
    <input type="file" id="ffoto" accept="image/*"></div></div>`;
}
function ligarFoto(estado) {
  const inp = $('#ffoto');
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    $('#fprev').innerHTML = '<div class="thumb ph">…</div>';
    try {
      const r = await prepararFoto(f);
      estado.foto = r.foto; estado.mini = r.mini; estado.mudou = true;
      $('#fprev').innerHTML = img(r.mini);
    } catch { toast('Não foi possível ler essa imagem'); $('#fprev').innerHTML = img(estado.mini); }
  };
  const rem = $('#frem');
  if (rem) rem.onclick = () => { estado.foto = estado.mini = null; estado.mudou = true; $('#fprev').innerHTML = img(null); rem.remove(); };
}

function vFormEspecie(id) {
  const e = id ? S.esp.find(x => x.id === id) : null;
  if (id && !e) return substituir('#');
  const nova = !e;
  const meses = structuredClone(e?.meses || VAZIO_MESES());
  const foto = {foto: e?.foto || null, mini: e?.mini || null, mudou: false};
  header(nova ? 'Nova planta' : 'Editar planta', true);
  app.innerHTML = `<form class="f" id="frm" autocomplete="off">
    ${campoFoto(foto.mini)}
    <label for="nc">Nome comum *</label><input id="nc" required value="${esc(e?.nomeComum)}" placeholder="ex.: Roseira">
    <label for="ns">Nome científico</label><input id="ns" value="${esc(e?.nomeCientifico)}" placeholder="ex.: Rosa × hybrida" style="font-style:italic">
    <div class="row"><div><label for="fa">Família</label><input id="fa" value="${esc(e?.familia)}" placeholder="ex.: Rosaceae"></div>
      <div><label for="ge">Género</label><input id="ge" value="${esc(e?.genero)}" placeholder="ex.: Rosa"></div></div>
    <label for="or">Origem</label><select id="or"><option value="">—</option>${e?.origem && !ORIGENS.includes(e.origem) ? `<option selected>${esc(e.origem)}</option>` : ''}${ORIGENS.map(o => `<option ${e?.origem === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
    ${nova ? `<fieldset><legend>Exemplares que tens</legend>
      <p class="hint">Podes acrescentar mais variedades depois, na ficha da planta.</p>
      <label for="vn">Variedade / cultivar</label><input id="vn" placeholder="ex.: 'Peace' (deixa vazio se não souberes)">
      <div class="row"><div><label for="vq">Número de plantas</label><input id="vq" type="number" min="0" inputmode="numeric" value="1"></div>
        <div><label for="vd">Data de aquisição</label><input id="vd" type="date"></div></div></fieldset>` : ''}
    <fieldset><legend>Calendário</legend><p class="hint">Toca nos meses de cada tarefa.</p>
      ${ATIV.map(([k, n]) => `<div class="act" style="--ac:var(--c-${k})"><b><i class="dot"></i>${n}</b><div class="months" data-k="${k}">
        ${MESES.map((m, i) => `<button type="button" data-m="${i + 1}" aria-pressed="${meses[k].includes(i + 1)}" aria-label="${n} em ${MESES_L[i]}">${m}</button>`).join('')}</div></div>`).join('')}
    </fieldset>
    <label for="no">Notas</label><textarea id="no" placeholder="Cuidados, localização no jardim, observações…">${esc(e?.notas)}</textarea>
    <div class="actions">${nova ? '' : '<button type="button" class="btn dan" id="apagar">Apagar</button>'}<button class="btn pri">Guardar</button></div>
  </form>`;
  ligarFoto(foto);
  app.querySelectorAll('.months').forEach(g => g.onclick = ev => {
    const b = ev.target.closest('button'); if (!b) return;
    const k = g.dataset.k, m = Number(b.dataset.m), arr = meses[k];
    const i = arr.indexOf(m);
    if (i >= 0) arr.splice(i, 1); else { arr.push(m); arr.sort((a, b) => a - b); }
    b.setAttribute('aria-pressed', i < 0);
  });
  $('#frm').onsubmit = async ev => {
    ev.preventDefault();
    const o = {
      ...(e || {id: uid(), criado: new Date().toISOString()}),
      nomeComum: $('#nc').value.trim(), nomeCientifico: $('#ns').value.trim(),
      familia: $('#fa').value.trim(), genero: $('#ge').value.trim(), origem: $('#or').value,
      meses, notas: $('#no').value.trim(), foto: foto.foto, mini: foto.mini, alterado: new Date().toISOString()
    };
    if (!o.nomeComum) return;
    await putEsp(o);
    if (nova) await putVar({id: uid(), especieId: o.id, nome: $('#vn').value.trim(), numero: Math.max(0, parseInt($('#vq').value) || 0), dataAquisicao: $('#vd').value, notas: '', foto: null, mini: null});
    await load();
    toast('Guardado');
    if (nova) substituir('#e/' + o.id); else voltar();
  };
  const ap = $('#apagar');
  if (ap) ap.onclick = async () => {
    if (!await confirmar(`Apagar "${e.nomeComum}" e todas as suas variedades? Não é possível desfazer.`)) return;
    await delEsp(e.id); await load(); toast('Planta apagada'); substituir('#');
  };
}

function vFormVariedade(varId, espId) {
  const v = varId ? S.vars.find(x => x.id === varId) : null;
  if (varId && !v) return substituir('#');
  const e = S.esp.find(x => x.id === (v ? v.especieId : espId));
  if (!e) return substituir('#');
  const foto = {foto: v?.foto || null, mini: v?.mini || null};
  header(v ? 'Editar variedade' : 'Nova variedade', true);
  app.innerHTML = `<form class="f" id="frm" autocomplete="off">
    <p class="meta" style="font-size:15px;margin:0 0 12px">${esc(e.nomeComum)}${e.nomeCientifico ? ` · <i>${esc(e.nomeCientifico)}</i>` : ''}</p>
    ${campoFoto(foto.mini)}<p class="hint">Sem foto própria, usa a foto da planta.</p>
    <label for="vn">Variedade / cultivar</label><input id="vn" value="${esc(v?.nome)}" placeholder="ex.: 'Gold Bunny'">
    <div class="row"><div><label for="vq">Número de plantas</label><input id="vq" type="number" min="0" inputmode="numeric" value="${v ? Number(v.numero) || 0 : 1}"></div>
      <div><label for="vd">Data de aquisição</label><input id="vd" type="date" value="${esc(v?.dataAquisicao)}"></div></div>
    <label for="no">Notas</label><textarea id="no" placeholder="Onde comprei, cor da flor, onde está plantada…">${esc(v?.notas)}</textarea>
    <div class="actions">${v ? '<button type="button" class="btn dan" id="apagar">Apagar</button>' : ''}<button class="btn pri">Guardar</button></div>
  </form>`;
  ligarFoto(foto);
  $('#frm').onsubmit = async ev => {
    ev.preventDefault();
    await putVar({...(v || {id: uid(), especieId: e.id}), nome: $('#vn').value.trim(), numero: Math.max(0, parseInt($('#vq').value) || 0),
      dataAquisicao: $('#vd').value, notas: $('#no').value.trim(), foto: foto.foto, mini: foto.mini});
    await load(); toast('Guardado'); voltar();
  };
  const ap = $('#apagar');
  if (ap) ap.onclick = async () => {
    if (!await confirmar(`Apagar ${v.nome ? `a variedade "${v.nome}"` : 'este registo'}?`)) return;
    await delVar(v.id); await load(); toast('Apagado'); voltar();
  };
}

/* ---------- Exportar / cópias ---------- */
const nativo = !!window.Android;
const b64 = blob => blob ? new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }) : null;
const unb64 = async s => s ? await (await fetch(s)).blob() : null;
const soB64 = async blob => { const d = await b64(blob); return d.slice(d.indexOf(',') + 1); };
async function descarregar(blob, nome) {
  if (nativo) {
    const r = window.Android.guardar(await soB64(blob), nome, blob.type.split(';')[0]);
    if (r !== 'ok') { toast('Não foi possível guardar: ' + r); return false; }
    return true;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
async function partilhar(blob, nome) {
  if (nativo) {
    const r = window.Android.partilhar(await soB64(blob), nome, blob.type.split(';')[0]);
    if (r !== 'ok') toast('Não foi possível partilhar: ' + r);
    return;
  }
  const f = new File([blob], nome, {type: blob.type});
  if (navigator.canShare && navigator.canShare({files: [f]})) {
    try { await navigator.share({files: [f], title: nome}); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  descarregar(blob, nome);
}
const hoje = () => new Date().toISOString().slice(0, 10);
const CAB = ['Nome comum','Nome científico','Família','Género','Origem','Variedade','Número de plantas','Data de aquisição',
  'Sementeira','Plantação','Poda','Adubação','Notas da planta','Notas da variedade'];
function csv() {
  const cel = x => { const s = String(x ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const mesesTxt = (e, k) => (e.meses?.[k] || []).map(m => MESES[m - 1]).join(', ');
  const linhas = [CAB];
  for (const e of S.esp) {
    const base = [e.nomeComum, e.nomeCientifico, e.familia, e.genero, e.origem];
    const fim = ATIV.map(([k]) => mesesTxt(e, k));
    const vs = varsDe(e.id);
    if (!vs.length) linhas.push([...base, '', '', '', ...fim, e.notas, '']);
    for (const v of vs) linhas.push([...base, v.nome, Number(v.numero) || 0, fmtData(v.dataAquisicao), ...fim, e.notas, v.notas]);
  }
  return new Blob(['﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n')], {type: 'text/csv;charset=utf-8'});
}

/* ---------- Importar CSV ---------- */
const semAc = s => String(s ?? '').trim().toLocaleLowerCase('pt').normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ');
const COLUNAS = {
  nomeComum: ['nome comum','nome','planta','especie'],
  nomeCientifico: ['nome cientifico','cientifico','nome latino'],
  familia: ['familia'], genero: ['genero'], origem: ['origem'],
  variedade: ['variedade','cultivar','variedade / cultivar','variedade/cultivar'],
  numero: ['numero de plantas','numero','quantidade','n plantas','qtd'],
  data: ['data de aquisicao','data aquisicao','data','aquisicao'],
  sementeira: ['sementeira','semear','epoca de sementeira'], plantacao: ['plantacao','plantar','epoca de plantacao'],
  poda: ['poda','podar'], adubacao: ['adubacao','adubar'],
  notas: ['notas da planta','notas','observacoes'], notasVar: ['notas da variedade']
};
function lerCSV(txt) {
  txt = txt.replace(/^﻿/, '');
  const l1 = txt.split(/\r?\n/)[0];
  const sep = [';', ',', '\t'].map(s => [s, l1.split(s).length]).sort((a, b) => b[1] - a[1])[0][0];
  const linhas = []; let lin = [], cel = '', aspas = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (aspas) {
      if (c === '"') { if (txt[i + 1] === '"') { cel += '"'; i++; } else aspas = false; }
      else cel += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { lin.push(cel); cel = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; lin.push(cel); linhas.push(lin); lin = []; cel = ''; }
    else cel += c;
  }
  if (cel !== '' || lin.length) { lin.push(cel); linhas.push(lin); }
  return linhas.filter(l => l.some(c => c.trim() !== ''));
}
function lerMeses(s) {
  const out = new Set();
  for (const p of semAc(s).replace(/\s*-\s*/g, '-').split(/\s*[,;/]\s*|\s+e\s+|\s+/).filter(Boolean)) {
    const intervalo = p.split('-');
    const num = x => { const n = parseInt(x); if (n >= 1 && n <= 12) return n; const i = MESES_L.findIndex(m => semAc(m).startsWith(x.slice(0, 3))); return i >= 0 ? i + 1 : 0; };
    if (intervalo.length === 2) {
      let a = num(intervalo[0]), b = num(intervalo[1]);
      if (a && b) { for (let m = a; ; m = m % 12 + 1) { out.add(m); if (m === b) break; } }
    } else { const n = num(p); if (n) out.add(n); }
  }
  return [...out].sort((a, b) => a - b);
}
function lerData(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return `${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return '';
}
const SINONIMOS = {autoctone:'Nativa', indigena:'Nativa', introduzida:'Exótica', alóctone:'Exótica', aloctone:'Exótica', hibrido:'Cultivar/híbrido', cultivar:'Cultivar/híbrido', hibrida:'Cultivar/híbrido', '?':'Desconhecida'};
function lerOrigem(s) {
  const n = semAc(s); if (!n) return '';
  if (SINONIMOS[n]) return SINONIMOS[n];
  return ORIGENS.find(o => semAc(o) === n) || ORIGENS.find(o => semAc(o).startsWith(n.slice(0, 5))) || s.trim();
}
async function textoDe(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', {fatal: true}).decode(buf); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}
async function importarCSV(file) {
  const linhas = lerCSV(await textoDe(file));
  if (linhas.length < 2) return toast('O ficheiro está vazio ou não tem dados');
  const cab = linhas[0].map(semAc);
  const idx = {};
  for (const [k, nomes] of Object.entries(COLUNAS)) idx[k] = cab.findIndex(c => nomes.includes(c));
  if (idx.nomeComum < 0 && idx.nomeCientifico < 0) return toast('Não encontrei a coluna "Nome comum" nem "Nome científico"');
  const val = (l, k) => idx[k] >= 0 ? String(l[idx[k]] ?? '').trim() : '';

  const chave = e => semAc(e.nomeCientifico) || semAc(e.nomeComum);
  const porChave = new Map(S.esp.map(e => [chave(e), e]));
  const porComum = new Map(S.esp.map(e => [semAc(e.nomeComum), e]));
  const mudEsp = new Map(), novasVar = [], mudVar = new Map();
  let ignoradas = 0, nEspNovas = 0;
  for (const l of linhas.slice(1)) {
    const nc = val(l, 'nomeComum'), ns = val(l, 'nomeCientifico');
    if (!nc && !ns) { ignoradas++; continue; }
    const k = semAc(ns) || semAc(nc);
    let e = porChave.get(k);
    if (!e && nc) { const c = porComum.get(semAc(nc)); if (c && (!ns || !c.nomeCientifico)) e = c; }
    if (e) e = mudEsp.get(e.id) || {...e, meses: structuredClone(e.meses || VAZIO_MESES())};
    else { e = {id: uid(), criado: new Date().toISOString(), nomeComum: nc || ns, nomeCientifico: ns, familia: '', genero: '', origem: '', meses: VAZIO_MESES(), notas: '', foto: null, mini: null}; nEspNovas++; }
    const se = (campo, v) => { if (v) e[campo] = v; };
    se('nomeComum', nc); se('nomeCientifico', ns); se('familia', val(l, 'familia')); se('genero', val(l, 'genero'));
    se('origem', lerOrigem(val(l, 'origem'))); se('notas', val(l, 'notas'));
    for (const [a] of ATIV) if (idx[a] >= 0 && val(l, a)) e.meses[a] = lerMeses(val(l, a));
    e.alterado = new Date().toISOString();
    mudEsp.set(e.id, e); porChave.set(k, e); porChave.set(chave(e), e); porComum.set(semAc(e.nomeComum), e);

    const vn = val(l, 'variedade'), nq = val(l, 'numero'), dt = lerData(val(l, 'data')), nv = val(l, 'notasVar');
    if (!vn && !nq && !dt && !nv) continue;
    const todas = [...S.vars, ...novasVar].filter(v => v.especieId === e.id);
    const existente = mudVar.get(e.id + '|' + semAc(vn)) || todas.find(v => semAc(v.nome) === semAc(vn));
    const numero = nq !== '' ? Math.max(0, parseInt(nq) || 0) : undefined;
    if (existente) {
      const v = {...existente};
      if (numero !== undefined) v.numero = numero;
      if (dt) v.dataAquisicao = dt;
      if (nv) v.notas = nv;
      mudVar.set(e.id + '|' + semAc(vn), v);
    } else {
      novasVar.push({id: uid(), especieId: e.id, nome: vn, numero: numero ?? 1, dataAquisicao: dt, notas: nv, foto: null, mini: null});
    }
  }
  const nEsp = mudEsp.size;
  if (!nEsp) return toast('Não encontrei plantas no ficheiro');
  const msg = `Importar "${file.name}"?\n\n• ${nEspNovas} ${nEspNovas === 1 ? 'planta nova' : 'plantas novas'}\n• ${nEsp - nEspNovas} ${nEsp - nEspNovas === 1 ? 'já existente (atualizada)' : 'já existentes (atualizadas)'}\n• ${novasVar.length} ${novasVar.length === 1 ? 'variedade nova' : 'variedades novas'}, ${mudVar.size} atualizadas${ignoradas ? `\n• ${ignoradas} linhas sem nome ignoradas` : ''}\n\nAs fotos e os dados que não estão no ficheiro mantêm-se.`;
  if (!await confirmar(msg, 'Importar')) return;
  await run(['especies','variedades'], t => {
    const se = t.objectStore('especies'), sv = t.objectStore('variedades');
    mudEsp.forEach(o => se.put(o)); novasVar.forEach(o => sv.put(o)); mudVar.forEach(o => sv.put(o));
  });
  await load(); toast('Importação concluída'); substituir('#');
}

async function copia() {
  const conv = async o => ({...o, foto: await b64(o.foto), mini: await b64(o.mini)});
  const dados = {app: 'o-meu-jardim', versao: 1, data: new Date().toISOString(),
    especies: await Promise.all(S.esp.map(conv)), variedades: await Promise.all(S.vars.map(conv))};
  return new Blob([JSON.stringify(dados)], {type: 'application/json'});
}
async function restaurar(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch { return toast('Ficheiro inválido'); }
  if (d.app !== 'o-meu-jardim' || !Array.isArray(d.especies)) return toast('Este ficheiro não é uma cópia desta app');
  if (!await confirmar(`Restaurar a cópia de ${new Date(d.data).toLocaleDateString('pt-PT')} (${d.especies.length} espécies)? Os dados atuais serão substituídos.`, 'Restaurar')) return;
  const esp = await Promise.all(d.especies.map(async o => ({...o, foto: await unb64(o.foto), mini: await unb64(o.mini)})));
  const vars = await Promise.all((d.variedades || []).map(async o => ({...o, foto: await unb64(o.foto), mini: await unb64(o.mini)})));
  await run(['especies','variedades'], t => {
    const se = t.objectStore('especies'), sv = t.objectStore('variedades');
    se.clear(); sv.clear(); esp.forEach(o => se.put(o)); vars.forEach(o => sv.put(o));
  });
  await load(); toast('Cópia restaurada'); route();
}
async function vDados() {
  header('Importar, exportar e cópias', true);
  const podePartilhar = nativo || !!(navigator.canShare && navigator.canShare({files: [new File(['x'], 'x.csv', {type: 'text/csv'})]}));
  app.innerHTML = `
    <section class="box"><h3>Exportar para Excel</h3>
      <p class="hint" style="margin:0 0 12px">Ficheiro CSV com uma linha por variedade, com os dados da espécie e as épocas. Abre diretamente no Excel ou no Google Sheets. As fotos não entram.</p>
      <div class="actions" style="margin:0"><button class="btn pri" id="csvD">Descarregar CSV</button>${podePartilhar ? '<button class="btn" id="csvP">Partilhar…</button>' : ''}</div></section>
    <section class="box"><h3>Importar de Excel (CSV)</h3>
      <p class="hint" style="margin:0 0 12px">Acrescenta plantas a partir de um ficheiro CSV, com uma linha por variedade. Usa as mesmas colunas da exportação; basta ter "Nome comum" ou "Nome científico". As plantas que já existem são atualizadas, e nada é apagado.</p>
      <label class="btn w" for="cf">Escolher ficheiro CSV</label><input type="file" id="cf" accept=".csv,text/csv,text/comma-separated-values,text/plain" hidden>
      <p class="hint">Dica: exporta primeiro um CSV e usa-o como modelo. No Excel, guarda como "CSV UTF-8". Os meses podem ser escritos como "Jan, Fev", "1, 2" ou "Jan-Mar".</p></section>
    <section class="box"><h3>Cópia de segurança</h3>
      <p class="hint" style="margin:0 0 12px">Guarda tudo, incluindo fotos, num único ficheiro. Faz uma cópia de vez em quando e guarda-a fora do telemóvel (por exemplo, no Google Drive).</p>
      <div class="actions" style="margin:0"><button class="btn pri" id="bkD">Fazer cópia</button>${podePartilhar ? '<button class="btn" id="bkP">Enviar para…</button>' : ''}</div>
      <p class="hint" id="ult"></p></section>
    <section class="box"><h3>Restaurar cópia</h3>
      <p class="hint" style="margin:0 0 12px">Substitui os dados atuais pelos de uma cópia de segurança.</p>
      <label class="btn w" for="rf">Escolher ficheiro de cópia</label><input type="file" id="rf" accept=".json,application/json" hidden></section>
    <section class="box"><h3>Armazenamento</h3><p class="hint" id="arm" style="margin:0">A verificar…</p></section>`;
  const nomeCsv = () => `jardim-${hoje()}.csv`, nomeBk = () => `jardim-copia-${hoje()}.json`;
  const marca = () => { try { localStorage.setItem('ultimaCopia', new Date().toISOString()); } catch {} mostraUlt(); };
  const mostraUlt = () => { let u; try { u = localStorage.getItem('ultimaCopia'); } catch {} $('#ult').textContent = u ? `Última cópia: ${new Date(u).toLocaleDateString('pt-PT')}` : 'Ainda não fizeste nenhuma cópia.'; };
  mostraUlt();
  $('#csvD').onclick = async () => { if (await descarregar(csv(), nomeCsv())) toast('CSV guardado em Transferências'); };
  if ($('#csvP')) $('#csvP').onclick = () => partilhar(csv(), nomeCsv());
  $('#bkD').onclick = async () => { if (await descarregar(await copia(), nomeBk())) { marca(); toast('Cópia guardada em Transferências'); } };
  if ($('#bkP')) $('#bkP').onclick = async () => { await partilhar(await copia(), nomeBk()); marca(); };
  $('#cf').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importarCSV(f).catch(err => toast('Erro ao importar: ' + err.message)); };
  $('#rf').onchange = ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) restaurar(f); };
  try {
    const p = nativo || (navigator.storage?.persisted ? await navigator.storage.persisted() : false);
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
    $('#arm').textContent = `${est ? `Espaço usado: ${(est.usage / 1048576).toFixed(1)} MB. ` : ''}${p ? 'Os dados estão protegidos contra limpeza automática.' : 'Instala a app no ecrã principal para proteger os dados contra limpeza automática.'}`;
  } catch { $('#arm').textContent = ''; }
}

/* ---------- Router ---------- */
let naLista = false, listaY = 0;
function route() {
  if (naLista) listaY = window.scrollY;
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  naLista = !p.length;
  window.scrollTo(0, 0);
  if (!p.length) { vLista(); window.scrollTo(0, listaY); return; }
  if (p[0] === 'nova') return vFormEspecie(null);
  if (p[0] === 'dados') return vDados();
  if (p[0] === 'v' && p[1]) return vFormVariedade(p[1]);
  if (p[0] === 'e' && p[1]) {
    if (p[2] === 'editar') return vFormEspecie(p[1]);
    if (p[2] === 'var') return vFormVariedade(null, p[1]);
    return vEspecie(p[1]);
  }
  substituir('#');
}
window.addEventListener('popstate', route);

(async () => {
  try {
    db = await openDB();
    await load();
    if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  } catch (err) {
    app.innerHTML = `<div class="empty"><p><b>Não foi possível abrir a base de dados.</b><br>${esc(err?.message || err)}</p></div>`;
    return;
  }
  route();
  if (!window.Android && 'serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
}
