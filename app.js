const state={items:[],selected:new Set(),category:'all',query:'',intent:null};
const $=id=>document.getElementById(id);
const els={form:$('searchForm'),query:$('query'),source:$('source'),pageSize:$('pageSize'),gallery:$('gallery'),empty:$('emptyState'),status:$('status'),title:$('resultsTitle'),selectAll:$('selectAllBtn'),export:$('exportBtn'),categoryBar:$('categoryBar'),dialog:$('previewDialog'),previewImage:$('previewImage'),previewTitle:$('previewTitle'),previewMeta:$('previewMeta'),previewSource:$('previewSource'),closeDialog:$('closeDialog'),theme:$('themeBtn'),engineInfo:$('engineInfo')};

els.form.addEventListener('submit',async e=>{e.preventDefault();const q=els.query.value.trim();if(!q)return;state.query=q;await runSearch(q)});
els.source.addEventListener('change',()=>{if(state.query)runSearch(state.query)});
els.selectAll.addEventListener('click',toggleSelectAll);
els.export.addEventListener('click',exportCatalog);
els.closeDialog.addEventListener('click',()=>els.dialog.close());
els.theme.addEventListener('click',()=>{document.body.classList.toggle('light');localStorage.setItem('rf-theme',document.body.classList.contains('light')?'light':'dark')});
if(localStorage.getItem('rf-theme')==='light')document.body.classList.add('light');

document.querySelectorAll('.chip').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.chip').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.category=btn.dataset.category;render()}));

async function runSearch(q){
  setLoading(true);state.items=[];state.selected.clear();state.intent=classifyQuery(q);showIntent();
  try{
    const count=Number(els.pageSize.value)||40;
    const source=els.source.value;
    const tasks=buildSourceTasks(source,state.intent,q,count);
    const batches=await Promise.all(tasks.map(x=>safeSource(x.name,x.run)));
    state.items=dedupe(batches.flat())
      .map(x=>({...x,score:relevanceScore(`${x.title} ${x.description||''}`,q,state.intent)}))
      .filter(x=>x.score>=state.intent.minimumScore)
      .sort((a,b)=>b.score-a.score)
      .slice(0,count);

    els.title.textContent=`Resultados para “${q}”`;
    const working=[...new Set(state.items.map(x=>x.provider))];
    els.status.textContent=state.items.length
      ?`${state.items.length} referências filtradas em ${working.join(' e ')}.`
      :noResultMessage(state.intent);
    els.empty.hidden=state.items.length>0;
    els.categoryBar.hidden=state.items.length===0;
    els.selectAll.disabled=state.items.length===0;
    if(!state.items.length){
      els.empty.querySelector('h3').textContent='Nenhuma referência aberta relevante';
      els.empty.querySelector('p').innerHTML=buildFallbackLinks(q,state.intent);
    }
    updateExport();render();
  }catch(err){
    console.error(err);els.status.textContent='Não foi possível concluir a pesquisa. Atualize a página e tente novamente.';els.empty.hidden=false;els.empty.querySelector('h3').textContent='Falha na pesquisa';els.empty.querySelector('p').textContent=err.message||'Verifique sua conexão.';
  }finally{setLoading(false)}
}

function classifyQuery(q){
  const s=normalize(q);
  const rules=[
    {type:'veiculo',label:'Veículo',icon:'🚗',test:/\b(carro|automovel|veiculo|chevrolet|fiat|ford|volkswagen|toyota|honda|omega|opala|gol|civic|truck|car|motorcycle|moto|caminhao)\b/,boost:['car','automobile','vehicle','front','rear','interior'],minimumScore:18},
    {type:'colecionavel',label:'Personagem ou colecionável',icon:'🦸',test:/\b(boneco|action figure|toy|figure|estatua|statue|personagem|superman|batman|marvel|dc comics|anime)\b/,boost:['action figure','toy','statue','collectible'],minimumScore:22},
    {type:'mecanica',label:'Peça ou máquina',icon:'⚙️',test:/\b(motor|engine|maquina|machine|peca|part|engrenagem|gear|compressor|bomba|pump|torno)\b/,boost:['technical','diagram','manual','parts'],minimumScore:18},
    {type:'arquitetura',label:'Arquitetura',icon:'🏛️',test:/\b(casa|predio|building|arquitetura|architecture|igreja|church|ponte|bridge|colonial|fachada)\b/,boost:['architecture','facade','plan','elevation'],minimumScore:16},
    {type:'espaco',label:'Espaço e astronomia',icon:'🚀',test:/\b(nasa|planeta|planet|lua|moon|marte|mars|galaxia|galaxy|space|espaco|foguete|rocket)\b/,boost:['NASA','space'],minimumScore:12},
    {type:'documento',label:'Manual ou documento técnico',icon:'📘',test:/\b(manual|catalogo|catalog|brochure|blueprint|planta|diagram|diagrama|esquema|technical)\b/,boost:['manual','catalog','brochure','diagram'],minimumScore:14}
  ];
  const hit=rules.find(r=>r.test.test(s))||{type:'geral',label:'Pesquisa geral',icon:'🔎',boost:[],minimumScore:16};
  return {...hit,terms:coreTerms(q)};
}

function buildSourceTasks(source,intent,q,count){
  const each=Math.max(12,Math.ceil(count/2));
  if(source==='commons')return[{name:'Wikimedia Commons',run:()=>searchCommons(q,count,intent)}];
  if(source==='archive')return[{name:'Internet Archive',run:()=>searchArchive(q,count,intent)}];
  if(source==='nasa')return[{name:'NASA Images',run:()=>searchNasa(q,count)}];
  const tasks=[{name:'Wikimedia Commons',run:()=>searchCommons(q,intent.type==='documento'?each:count,intent)}];
  if(['documento','mecanica','veiculo'].includes(intent.type))tasks.push({name:'Internet Archive',run:()=>searchArchive(q,each,intent)});
  if(intent.type==='espaco')tasks.push({name:'NASA Images',run:()=>searchNasa(q,each)});
  return tasks;
}

async function safeSource(name,fn){try{return await fn()}catch(err){console.warn(`${name} indisponível`,err);return[]}}

async function searchCommons(q,count,intent){
  const queries=buildQueries(q,intent);let collected=[];
  for(const term of queries){
    const searchParams=new URLSearchParams({action:'query',format:'json',origin:'*',list:'search',srsearch:term,srnamespace:'6',srlimit:String(Math.min(Math.max(count*2,25),50))});
    const sr=await fetch(`https://commons.wikimedia.org/w/api.php?${searchParams}`);if(!sr.ok)throw new Error(`Wikimedia respondeu com erro ${sr.status}`);
    const searchData=await sr.json();const titles=(searchData.query?.search||[]).map(x=>x.title);if(!titles.length)continue;
    const detailsParams=new URLSearchParams({action:'query',format:'json',origin:'*',titles:titles.join('|'),prop:'imageinfo',iiprop:'url|extmetadata|size',iiurlwidth:'700'});
    const dr=await fetch(`https://commons.wikimedia.org/w/api.php?${detailsParams}`);if(!dr.ok)continue;
    const data=await dr.json();
    const items=Object.values(data.query?.pages||{}).map((p,i)=>{
      const info=p.imageinfo?.[0]||{},meta=info.extmetadata||{};const title=(p.title||'').replace(/^File:/,'');
      const description=stripHtml(meta.ImageDescription?.value||'');const categories=stripHtml(meta.Categories?.value||'');
      return{id:`wc-${p.pageid||i}`,title,description:`${description} ${categories}`,thumb:info.thumburl||info.url,full:info.url||info.thumburl,sourceUrl:info.descriptionurl||info.url,creator:stripHtml(meta.Artist?.value)||'Autor não informado',license:meta.LicenseShortName?.value||meta.UsageTerms?.value||'Licença não informada',provider:'Wikimedia Commons',width:info.width,height:info.height,category:suggestCategory(`${title} ${description} ${categories}`,q)};
    }).filter(x=>x.thumb&&!looksLikeDocumentScan(x,intent));
    collected.push(...items);if(dedupe(collected).length>=count)break;
  }
  return dedupe(collected).slice(0,count*2);
}

async function searchArchive(q,count,intent){
  const main=(intent.terms.join(' ')||q);const extras=intent.boost.slice(0,2).join(' ');const term=escapeArchive(`${main} ${extras}`.trim());
  const media=intent.type==='documento'?'mediatype:texts':'(mediatype:image OR mediatype:texts)';
  const params=new URLSearchParams({q:`(${term}) AND ${media}`,fl:['identifier','title','creator','mediatype','year','description','subject'].join(','),rows:String(Math.min(Math.max(count*2,25),50)),page:'1',output:'json'});
  const r=await fetch(`https://archive.org/advancedsearch.php?${params}`);if(!r.ok)throw new Error(`Internet Archive respondeu com erro ${r.status}`);const data=await r.json();
  return(data.response?.docs||[]).map((x,i)=>({id:`ia-${x.identifier||i}`,title:cleanValue(x.title)||x.identifier||'Sem título',description:`${cleanValue(x.description)} ${cleanValue(x.subject)}`,thumb:`https://archive.org/services/img/${encodeURIComponent(x.identifier)}`,full:`https://archive.org/services/img/${encodeURIComponent(x.identifier)}`,sourceUrl:`https://archive.org/details/${encodeURIComponent(x.identifier)}`,creator:cleanValue(x.creator)||'Autor não informado',license:'Confira os direitos na página original',provider:'Internet Archive',width:null,height:null,category:suggestCategory(`${cleanValue(x.title)} ${cleanValue(x.description)} ${x.mediatype||''}`,q)}));
}

async function searchNasa(q,count){
  const r=await fetch(`https://images-api.nasa.gov/search?q=${encodeURIComponent(q)}&media_type=image&page_size=${Math.min(count,100)}`);if(!r.ok)throw new Error(`NASA respondeu com erro ${r.status}`);const data=await r.json();
  return(data.collection?.items||[]).map((x,i)=>{const d=x.data?.[0]||{},link=x.links?.find(l=>l.render==='image')||x.links?.[0]||{};return{id:`nasa-${d.nasa_id||i}`,title:d.title||'Sem título',description:d.description||'',thumb:link.href,full:link.href,sourceUrl:`https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id||'')}`,creator:d.center||'NASA',license:'Conteúdo NASA — verifique as regras de uso',provider:'NASA Images',width:null,height:null,category:'principal'}}).filter(x=>x.thumb);
}

function buildQueries(q,intent){
  const main=intent.terms.join(' ')||q;const quoted=`"${main}"`;const queries=[quoted,main];
  intent.boost.forEach(b=>queries.push(`${quoted} ${b}`));
  if(intent.type==='veiculo')queries.push(`${quoted} front rear side interior`);
  if(intent.type==='colecionavel')queries.push(`${quoted} action figure`,`${quoted} statue collectible`);
  if(intent.type==='mecanica')queries.push(`${quoted} technical diagram`,`${quoted} parts`);
  return[...new Set(queries.filter(Boolean))];
}

function coreTerms(q){const stop=new Set(['foto','fotos','imagem','imagens','de','da','do','das','dos','um','uma','o','a','os','as','para','com','boneco','bonecos','miniatura','miniaturas','figura','figuras','quero','achar','buscar']);return normalize(q).split(/\s+/).filter(w=>w.length>2&&!stop.has(w))}
function relevanceScore(text,q,intent){
  const hay=normalize(text);const terms=intent.terms;if(!terms.length)return 1;let score=0;let hits=0;
  terms.forEach(t=>{if(hay.includes(t)){hits++;score+=14}});if(hits===0)return 0;if(hits===terms.length)score+=28;
  const phrase=terms.join(' ');if(phrase&&hay.includes(phrase))score+=35;
  intent.boost.forEach(b=>{if(hay.includes(normalize(b)))score+=6});
  if(/scan|book|page|document|text|manuscript/.test(hay)&&!['documento','mecanica'].includes(intent.type))score-=24;
  if(/superman/.test(normalize(q))&&!hay.includes('superman'))return 0;
  return score;
}
function looksLikeDocumentScan(item,intent){if(['documento','mecanica'].includes(intent.type))return false;const s=normalize(`${item.title} ${item.description}`);return /book page manuscript text document scan pdf.djvu/.test(s)}
function noResultMessage(intent){return `Não encontramos mídia aberta suficientemente relevante para ${intent.label.toLowerCase()}. Use os atalhos abaixo para ampliar a pesquisa na web.`}
function buildFallbackLinks(q,intent){const encoded=encodeURIComponent(q);const imageQ=encodeURIComponent(`${q} reference images`);return `A busca aberta foi limitada. <a href="https://www.google.com/search?tbm=isch&q=${imageQ}" target="_blank" rel="noopener">Abrir Google Imagens</a> · <a href="https://www.bing.com/images/search?q=${imageQ}" target="_blank" rel="noopener">Abrir Bing Imagens</a> · <a href="https://archive.org/search?query=${encoded}" target="_blank" rel="noopener">Abrir Internet Archive</a>`}
function showIntent(){if(!els.engineInfo||!state.intent)return;els.engineInfo.textContent=`${state.intent.icon} Tipo detectado: ${state.intent.label} · fontes escolhidas automaticamente`}
function normalize(s=''){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function escapeArchive(q){return q.split(/\s+/).filter(Boolean).map(w=>`(${w.replace(/["()]/g,'')})`).join(' AND ')}
function cleanValue(v){return Array.isArray(v)?v.join(', '):(v==null?'':String(v))}
function dedupe(items){const seen=new Set();return items.filter(x=>{const key=normalize(x.sourceUrl||x.thumb||x.title);if(!key||seen.has(key))return false;seen.add(key);return true})}
function suggestCategory(text,q){const s=normalize(`${text} ${q}`);if(/interior|dashboard|painel|cabine|cabin|cockpit|seat|banco/.test(s))return'interior';if(/drawing|blueprint|diagram|technical|esquema|manual|catalog|brochure|planta|section|cutaway|texts/.test(s))return'tecnico';if(/detail|close|wheel|roda|engine|motor|texture|detalhe|part|peca/.test(s))return'detalhes';return'principal'}
function stripHtml(v=''){const d=document.createElement('div');d.innerHTML=v;return d.textContent.trim()}
function setLoading(on){if(on){els.empty.hidden=true;els.gallery.innerHTML='<div class="loader">O Reference Engine está entendendo a pesquisa e escolhendo as fontes…</div>';els.status.textContent='Classificando a pesquisa, buscando e filtrando resultados…';els.selectAll.disabled=true;els.export.disabled=true}else if(!state.items.length)els.gallery.innerHTML=''}
function render(){const items=state.category==='all'?state.items:state.items.filter(x=>x.category===state.category);els.gallery.innerHTML='';if(!items.length&&state.items.length){els.gallery.innerHTML='<div class="loader">Nenhuma referência nesta categoria.</div>';return}items.forEach(item=>{const card=document.createElement('article');card.className=`card${state.selected.has(item.id)?' selected':''}`;card.innerHTML=`<span class="license">${escapeHtml(item.provider)}</span><img class="thumb" loading="lazy" src="${escapeAttr(item.thumb)}" alt="${escapeAttr(item.title)}"><div class="card-body"><div class="card-title" title="${escapeAttr(item.title)}">${escapeHtml(item.title)}</div><div class="card-meta">Relevância ${Math.max(1,Math.min(5,Math.round((item.score||10)/20)))}★ · ${escapeHtml(item.creator)}${item.width?` • ${item.width}×${item.height||'?'}`:''}</div><div class="card-controls"><select aria-label="Categoria"><option value="principal">Principal</option><option value="detalhes">Detalhes</option><option value="interior">Interior</option><option value="tecnico">Técnico</option><option value="outros">Outros</option></select><button class="pick${state.selected.has(item.id)?' active':''}" aria-label="Selecionar">✓</button></div></div>`;const img=card.querySelector('.thumb');img.addEventListener('error',()=>img.closest('.card')?.remove(),{once:true});const select=card.querySelector('select');select.value=item.category;select.addEventListener('change',e=>{item.category=e.target.value;if(state.category!=='all')render()});card.querySelector('.pick').addEventListener('click',()=>toggleItem(item.id));img.addEventListener('click',()=>preview(item));els.gallery.appendChild(card)});updateExport()}
function toggleItem(id){state.selected.has(id)?state.selected.delete(id):state.selected.add(id);render()}
function toggleSelectAll(){const visible=state.category==='all'?state.items:state.items.filter(x=>x.category===state.category);const all=visible.length&&visible.every(x=>state.selected.has(x.id));visible.forEach(x=>all?state.selected.delete(x.id):state.selected.add(x.id));render()}
function updateExport(){els.export.disabled=state.selected.size===0;els.export.textContent=state.selected.size?`Exportar catálogo (${state.selected.size})`:'Exportar catálogo'}
function preview(item){els.previewImage.src=item.full;els.previewTitle.textContent=item.title;els.previewMeta.textContent=`${item.creator} • ${item.license} • ${item.provider}`;els.previewSource.href=item.sourceUrl;els.dialog.showModal()}
function exportCatalog(){const selected=state.items.filter(x=>state.selected.has(x.id));const rows=selected.map(x=>`<article><img src="${escapeAttr(x.thumb)}"><div><h2>${escapeHtml(x.title)}</h2><p><b>Categoria:</b> ${escapeHtml(x.category)}</p><p><b>Autor:</b> ${escapeHtml(x.creator)}</p><p><b>Direitos/licença:</b> ${escapeHtml(x.license)}</p><p><b>Fonte:</b> ${escapeHtml(x.provider)}</p><a href="${escapeAttr(x.sourceUrl)}">Abrir origem</a></div></article>`).join('');const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Catálogo - ${escapeHtml(state.query)}</title><style>body{font-family:Arial;margin:32px;color:#182234}h1{border-bottom:3px solid #398cff;padding-bottom:14px}article{display:grid;grid-template-columns:260px 1fr;gap:20px;padding:20px 0;border-bottom:1px solid #ddd}img{width:100%;max-height:220px;object-fit:contain;background:#eee}p{margin:7px 0}a{color:#176bc1}@media(max-width:600px){article{grid-template-columns:1fr}}</style><h1>ReferenceForge — ${escapeHtml(state.query)}</h1><p>${selected.length} referências selecionadas. Confirme os direitos na página de origem antes de reutilizar ou publicar.</p>${rows}</html>`;const blob=new Blob([html],{type:'text/html;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`referenceforge-${slug(state.query)}.html`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function slug(s){return normalize(s).replace(/\s+/g,'-').replace(/(^-|-$)/g,'')}
function escapeHtml(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(s=''){return escapeHtml(s)}