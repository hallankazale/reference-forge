const state={items:[],selected:new Set(),category:'all',query:''};
const $=id=>document.getElementById(id);
const els={form:$('searchForm'),query:$('query'),source:$('source'),pageSize:$('pageSize'),gallery:$('gallery'),empty:$('emptyState'),status:$('status'),title:$('resultsTitle'),selectAll:$('selectAllBtn'),export:$('exportBtn'),categoryBar:$('categoryBar'),dialog:$('previewDialog'),previewImage:$('previewImage'),previewTitle:$('previewTitle'),previewMeta:$('previewMeta'),previewSource:$('previewSource'),closeDialog:$('closeDialog'),theme:$('themeBtn')};

els.form.addEventListener('submit',async e=>{e.preventDefault();const q=els.query.value.trim();if(!q)return;state.query=q;await runSearch(q)});
els.source.addEventListener('change',()=>{if(state.query)runSearch(state.query)});
els.selectAll.addEventListener('click',toggleSelectAll);
els.export.addEventListener('click',exportCatalog);
els.closeDialog.addEventListener('click',()=>els.dialog.close());
els.theme.addEventListener('click',()=>{document.body.classList.toggle('light');localStorage.setItem('rf-theme',document.body.classList.contains('light')?'light':'dark')});
if(localStorage.getItem('rf-theme')==='light')document.body.classList.add('light');

document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.category=btn.dataset.category;render()}));

async function runSearch(q){
  setLoading(true);state.items=[];state.selected.clear();
  try{
    const count=Number(els.pageSize.value)||40;
    const source=els.source.value;
    let batches=[];
    if(source==='commons') batches=[await safeSource('Wikimedia Commons',()=>searchCommons(q,count))];
    else if(source==='archive') batches=[await safeSource('Internet Archive',()=>searchArchive(q,count))];
    else {
      const each=Math.max(10,Math.ceil(count/2));
      batches=await Promise.all([
        safeSource('Wikimedia Commons',()=>searchCommons(q,each)),
        safeSource('Internet Archive',()=>searchArchive(q,each))
      ]);
    }
    state.items=dedupe(batches.flat()).slice(0,count);
    els.title.textContent=`Resultados para “${q}”`;
    const working=[...new Set(state.items.map(x=>x.provider))];
    els.status.textContent=state.items.length
      ?`${state.items.length} referências encontradas em ${working.join(' e ')}.`
      :'Nenhuma referência encontrada. Tente reduzir os termos, retirar o ano ou pesquisar em inglês.';
    els.empty.hidden=state.items.length>0;
    els.categoryBar.hidden=state.items.length===0;
    els.selectAll.disabled=state.items.length===0;
    if(!state.items.length){els.empty.querySelector('h3').textContent='Nenhum resultado';els.empty.querySelector('p').textContent='Tente uma pesquisa mais simples, como “Chevrolet Omega” ou “Omega car”.'}
    updateExport();render();
  }catch(err){
    console.error(err);els.status.textContent='Não foi possível concluir a pesquisa. Atualize a página e tente novamente.';els.empty.hidden=false;els.empty.querySelector('h3').textContent='Falha na pesquisa';els.empty.querySelector('p').textContent=err.message||'Verifique sua conexão.';
  }finally{setLoading(false)}
}

async function safeSource(name,fn){try{return await fn()}catch(err){console.warn(`${name} indisponível`,err);return[]}}

async function searchCommons(q,count){
  const queries=[q,broaden(q)];
  for(const term of queries){
    const params=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:term,gsrnamespace:'6',gsrlimit:String(Math.min(count,50)),prop:'imageinfo',iiprop:'url|extmetadata|size',iiurlwidth:'700'});
    const r=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);
    if(!r.ok)throw new Error(`Wikimedia respondeu com erro ${r.status}`);
    const data=await r.json();
    const items=Object.values(data.query?.pages||{}).map((p,i)=>{const info=p.imageinfo?.[0]||{},meta=info.extmetadata||{};return{id:`wc-${p.pageid||i}`,title:(p.title||'').replace(/^File:/,''),thumb:info.thumburl||info.url,full:info.url||info.thumburl,sourceUrl:info.descriptionurl||info.url,creator:stripHtml(meta.Artist?.value)||'Autor não informado',license:meta.LicenseShortName?.value||meta.UsageTerms?.value||'Licença não informada',provider:'Wikimedia Commons',width:info.width,height:info.height,category:suggestCategory(p.title||'',q)}}).filter(x=>x.thumb);
    if(items.length)return items;
  }
  return[];
}

async function searchArchive(q,count){
  const term=escapeArchive(q);
  const search=`(${term}) AND (mediatype:image OR mediatype:texts)`;
  const params=new URLSearchParams({q:search,fl:['identifier','title','creator','mediatype','year','description'].join(','),rows:String(Math.min(count,50)),page:'1',output:'json'});
  const r=await fetch(`https://archive.org/advancedsearch.php?${params}`);
  if(!r.ok)throw new Error(`Internet Archive respondeu com erro ${r.status}`);
  const data=await r.json();
  return (data.response?.docs||[]).map((x,i)=>({
    id:`ia-${x.identifier||i}`,
    title:cleanValue(x.title)||x.identifier||'Sem título',
    thumb:`https://archive.org/services/img/${encodeURIComponent(x.identifier)}`,
    full:`https://archive.org/services/img/${encodeURIComponent(x.identifier)}`,
    sourceUrl:`https://archive.org/details/${encodeURIComponent(x.identifier)}`,
    creator:cleanValue(x.creator)||'Autor não informado',
    license:'Confira os direitos na página original',
    provider:'Internet Archive',
    width:null,height:null,
    category:suggestCategory(`${cleanValue(x.title)} ${cleanValue(x.description)} ${x.mediatype||''}`,q)
  })).filter(x=>x.thumb);
}

function broaden(q){return q.replace(/\b(18|19|20)\d{2}\b/g,'').replace(/\s+/g,' ').trim()||q}
function escapeArchive(q){return q.split(/\s+/).filter(Boolean).map(w=>`(${w.replace(/["()]/g,'')})`).join(' AND ')}
function cleanValue(v){return Array.isArray(v)?v.join(', '):(v==null?'':String(v))}
function dedupe(items){const seen=new Set();return items.filter(x=>{const key=(x.sourceUrl||x.thumb||x.title).toLowerCase();if(seen.has(key))return false;seen.add(key);return true})}
function suggestCategory(text,q){const s=`${text} ${q}`.toLowerCase();if(/interior|dashboard|painel|cabine|cabin|cockpit|seat|banco/.test(s))return'interior';if(/drawing|blueprint|diagram|technical|esquema|manual|catalog|brochure|planta|section|cutaway|texts/.test(s))return'tecnico';if(/detail|close|wheel|roda|engine|motor|texture|detalhe|part|peça/.test(s))return'detalhes';return'principal'}
function stripHtml(v=''){const d=document.createElement('div');d.innerHTML=v;return d.textContent.trim()}
function setLoading(on){if(on){els.empty.hidden=true;els.gallery.innerHTML='<div class="loader">Pesquisando em várias fontes abertas…</div>';els.status.textContent='Buscando referências e informações de origem…';els.selectAll.disabled=true;els.export.disabled=true}else if(!state.items.length)els.gallery.innerHTML=''}

function render(){const items=state.category==='all'?state.items:state.items.filter(x=>x.category===state.category);els.gallery.innerHTML='';if(!items.length&&state.items.length){els.gallery.innerHTML='<div class="loader">Nenhuma referência nesta categoria.</div>';return}items.forEach(item=>{const card=document.createElement('article');card.className=`card${state.selected.has(item.id)?' selected':''}`;card.innerHTML=`<span class="license">${escapeHtml(item.provider)}</span><img class="thumb" loading="lazy" src="${escapeAttr(item.thumb)}" alt="${escapeAttr(item.title)}"><div class="card-body"><div class="card-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</div><div class="card-meta">${escapeHtml(item.creator)}${item.width?` • ${item.width}×${item.height||'?'}`:''}</div><div class="card-controls"><select aria-label="Categoria"><option value="principal">Principal</option><option value="detalhes">Detalhes</option><option value="interior">Interior</option><option value="tecnico">Técnico</option><option value="outros">Outros</option></select><button class="pick${state.selected.has(item.id)?' active':''}" aria-label="Selecionar">✓</button></div></div>`;
  const img=card.querySelector('.thumb');img.addEventListener('error',()=>{img.closest('.card')?.remove()},{once:true});
  const select=card.querySelector('select');select.value=item.category;select.addEventListener('change',e=>{item.category=e.target.value;if(state.category!=='all')render()});
  card.querySelector('.pick').addEventListener('click',()=>toggleItem(item.id));img.addEventListener('click',()=>preview(item));els.gallery.appendChild(card)});updateExport()}

function toggleItem(id){state.selected.has(id)?state.selected.delete(id):state.selected.add(id);render()}
function toggleSelectAll(){const visible=state.category==='all'?state.items:state.items.filter(x=>x.category===state.category);const all=visible.length&&visible.every(x=>state.selected.has(x.id));visible.forEach(x=>all?state.selected.delete(x.id):state.selected.add(x.id));render()}
function updateExport(){els.export.disabled=state.selected.size===0;els.export.textContent=state.selected.size?`Exportar catálogo (${state.selected.size})`:'Exportar catálogo'}
function preview(item){els.previewImage.src=item.full;els.previewTitle.textContent=item.title;els.previewMeta.textContent=`${item.creator} • ${item.license} • ${item.provider}`;els.previewSource.href=item.sourceUrl;els.dialog.showModal()}

function exportCatalog(){const selected=state.items.filter(x=>state.selected.has(x.id));const rows=selected.map(x=>`<article><img src="${escapeAttr(x.thumb)}"><div><h2>${escapeHtml(x.title)}</h2><p><b>Categoria:</b> ${escapeHtml(x.category)}</p><p><b>Autor:</b> ${escapeHtml(x.creator)}</p><p><b>Direitos/licença:</b> ${escapeHtml(x.license)}</p><p><b>Fonte:</b> ${escapeHtml(x.provider)}</p><a href="${escapeAttr(x.sourceUrl)}">Abrir origem</a></div></article>`).join('');const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Catálogo - ${escapeHtml(state.query)}</title><style>body{font-family:Arial;margin:32px;color:#182234}h1{border-bottom:3px solid #398cff;padding-bottom:14px}article{display:grid;grid-template-columns:260px 1fr;gap:20px;padding:20px 0;border-bottom:1px solid #ddd}img{width:100%;max-height:220px;object-fit:contain;background:#eee}p{margin:7px 0}a{color:#176bc1}@media(max-width:600px){article{grid-template-columns:1fr}}</style><h1>ReferenceForge — ${escapeHtml(state.query)}</h1><p>${selected.length} referências selecionadas. Confirme os direitos na página de origem antes de reutilizar ou publicar.</p>${rows}</html>`;const blob=new Blob([html],{type:'text/html;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`referenceforge-${slug(state.query)}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(s=''){return escapeHtml(s)}