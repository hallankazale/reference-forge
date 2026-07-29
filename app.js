const state={items:[],selected:new Set(),category:'all',query:''};
const $=id=>document.getElementById(id);
const els={form:$('searchForm'),query:$('query'),source:$('source'),pageSize:$('pageSize'),gallery:$('gallery'),empty:$('emptyState'),status:$('status'),title:$('resultsTitle'),selectAll:$('selectAllBtn'),export:$('exportBtn'),categoryBar:$('categoryBar'),dialog:$('previewDialog'),previewImage:$('previewImage'),previewTitle:$('previewTitle'),previewMeta:$('previewMeta'),previewSource:$('previewSource'),closeDialog:$('closeDialog'),theme:$('themeBtn')};

els.form.addEventListener('submit',async e=>{e.preventDefault();const q=els.query.value.trim();if(!q)return;state.query=q;await search(q)});
els.source.addEventListener('change',()=>{if(state.query)search(state.query)});
els.selectAll.addEventListener('click',toggleSelectAll);
els.export.addEventListener('click',exportCatalog);
els.closeDialog.addEventListener('click',()=>els.dialog.close());
els.theme.addEventListener('click',()=>{document.body.classList.toggle('light');localStorage.setItem('rf-theme',document.body.classList.contains('light')?'light':'dark')});
if(localStorage.getItem('rf-theme')==='light')document.body.classList.add('light');

document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.category=btn.dataset.category;render()}));

async function search(q){
  setLoading(true);state.items=[];state.selected.clear();
  try{
    const count=Number(els.pageSize.value);
    state.items=els.source.value==='commons'?await searchCommons(q,count):await searchOpenverse(q,count);
    els.title.textContent=`Resultados para “${q}”`;
    els.status.textContent=`${state.items.length} referências encontradas. Selecione as melhores para o catálogo.`;
    els.empty.hidden=state.items.length>0;els.categoryBar.hidden=state.items.length===0;
    els.selectAll.disabled=state.items.length===0;updateExport();render();
  }catch(err){
    console.error(err);els.status.textContent='Não foi possível concluir a busca. Tente outra fonte ou pesquise novamente.';els.empty.hidden=false;els.empty.querySelector('h3').textContent='Falha na pesquisa';els.empty.querySelector('p').textContent=err.message||'Verifique sua conexão.';
  }finally{setLoading(false)}
}

async function searchOpenverse(q,count){
  const url=`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=${count}&mature=false`;
  const r=await fetch(url);if(!r.ok)throw new Error(`Openverse respondeu com erro ${r.status}`);const data=await r.json();
  return (data.results||[]).map((x,i)=>({id:`ov-${x.id||i}`,title:x.title||'Sem título',thumb:x.thumbnail||x.url,full:x.url||x.thumbnail,sourceUrl:x.foreign_landing_url||x.detail_url||x.url,creator:x.creator||'Autor não informado',license:[x.license,x.license_version].filter(Boolean).join(' ').toUpperCase()||'Licença não informada',provider:x.provider||x.source||'Openverse',width:x.width,height:x.height,category:suggestCategory(x.title||'',q)})).filter(x=>x.thumb);
}

async function searchCommons(q,count){
  const params=new URLSearchParams({action:'query',format:'json',origin:'*',generator:'search',gsrsearch:q,gsrnamespace:'6',gsrlimit:String(Math.min(count,50)),prop:'imageinfo',iiprop:'url|extmetadata|size',iiurlwidth:'700'});
  const r=await fetch(`https://commons.wikimedia.org/w/api.php?${params}`);if(!r.ok)throw new Error(`Wikimedia respondeu com erro ${r.status}`);const data=await r.json();
  return Object.values(data.query?.pages||{}).map((p,i)=>{const info=p.imageinfo?.[0]||{},meta=info.extmetadata||{};return{id:`wc-${p.pageid||i}`,title:(p.title||'').replace(/^File:/,''),thumb:info.thumburl||info.url,full:info.url||info.thumburl,sourceUrl:info.descriptionurl||info.url,creator:stripHtml(meta.Artist?.value)||'Autor não informado',license:meta.LicenseShortName?.value||meta.UsageTerms?.value||'Licença não informada',provider:'Wikimedia Commons',width:info.width,height:info.height,category:suggestCategory(p.title||'',q)}}).filter(x=>x.thumb);
}

function suggestCategory(text,q){const s=`${text} ${q}`.toLowerCase();if(/interior|dashboard|painel|cabine|cabin|cockpit|seat|banco/.test(s))return'interior';if(/drawing|blueprint|diagram|technical|esquema|manual|planta|section|cutaway/.test(s))return'tecnico';if(/detail|close|wheel|roda|engine|motor|texture|detalhe/.test(s))return'detalhes';return'principal'}
function stripHtml(v=''){const d=document.createElement('div');d.innerHTML=v;return d.textContent.trim()}
function setLoading(on){if(on){els.empty.hidden=true;els.gallery.innerHTML='<div class="loader">Pesquisando referências abertas…</div>';els.status.textContent='Buscando imagens e informações de licença…';els.selectAll.disabled=true;els.export.disabled=true}else if(!state.items.length)els.gallery.innerHTML=''}

function render(){const items=state.category==='all'?state.items:state.items.filter(x=>x.category===state.category);els.gallery.innerHTML='';if(!items.length&&state.items.length){els.gallery.innerHTML='<div class="loader">Nenhuma imagem nesta categoria.</div>';return}items.forEach(item=>{const card=document.createElement('article');card.className=`card${state.selected.has(item.id)?' selected':''}`;card.innerHTML=`<span class="license">${escapeHtml(item.license)}</span><img class="thumb" loading="lazy" src="${escapeAttr(item.thumb)}" alt="${escapeAttr(item.title)}"><div class="card-body"><div class="card-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</div><div class="card-meta">${escapeHtml(item.creator)} • ${item.width||'?'}×${item.height||'?'}</div><div class="card-controls"><select aria-label="Categoria"><option value="principal">Principal</option><option value="detalhes">Detalhes</option><option value="interior">Interior</option><option value="tecnico">Técnico</option><option value="outros">Outros</option></select><button class="pick${state.selected.has(item.id)?' active':''}" aria-label="Selecionar">✓</button></div></div>`;
    const select=card.querySelector('select');select.value=item.category;select.addEventListener('change',e=>{item.category=e.target.value;if(state.category!=='all')render()});
    card.querySelector('.pick').addEventListener('click',()=>toggleItem(item.id));card.querySelector('.thumb').addEventListener('click',()=>preview(item));els.gallery.appendChild(card)});updateExport()}

function toggleItem(id){state.selected.has(id)?state.selected.delete(id):state.selected.add(id);render()}
function toggleSelectAll(){const visible=state.category==='all'?state.items:state.items.filter(x=>x.category===state.category);const all=visible.every(x=>state.selected.has(x.id));visible.forEach(x=>all?state.selected.delete(x.id):state.selected.add(x.id));render()}
function updateExport(){els.export.disabled=state.selected.size===0;els.export.textContent=state.selected.size?`Exportar catálogo (${state.selected.size})`:'Exportar catálogo'}
function preview(item){els.previewImage.src=item.full;els.previewTitle.textContent=item.title;els.previewMeta.textContent=`${item.creator} • ${item.license} • ${item.provider}`;els.previewSource.href=item.sourceUrl;els.dialog.showModal()}

function exportCatalog(){const selected=state.items.filter(x=>state.selected.has(x.id));const rows=selected.map(x=>`<article><img src="${escapeAttr(x.thumb)}"><div><h2>${escapeHtml(x.title)}</h2><p><b>Categoria:</b> ${escapeHtml(x.category)}</p><p><b>Autor:</b> ${escapeHtml(x.creator)}</p><p><b>Licença:</b> ${escapeHtml(x.license)}</p><p><b>Fonte:</b> ${escapeHtml(x.provider)}</p><a href="${escapeAttr(x.sourceUrl)}">Abrir origem</a></div></article>`).join('');const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Catálogo - ${escapeHtml(state.query)}</title><style>body{font-family:Arial;margin:32px;color:#182234}h1{border-bottom:3px solid #398cff;padding-bottom:14px}article{display:grid;grid-template-columns:260px 1fr;gap:20px;padding:20px 0;border-bottom:1px solid #ddd}img{width:100%;max-height:220px;object-fit:contain;background:#eee}p{margin:7px 0}a{color:#176bc1}@media(max-width:600px){article{grid-template-columns:1fr}}</style><h1>ReferenceForge — ${escapeHtml(state.query)}</h1><p>${selected.length} referências selecionadas. Confira a licença na fonte antes de reutilizar ou publicar.</p>${rows}</html>`;const blob=new Blob([html],{type:'text/html;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`referenceforge-${slug(state.query)}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function slug(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(s=''){return escapeHtml(s)}