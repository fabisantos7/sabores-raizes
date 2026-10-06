/* ═══════════════════════════════════════════════════════════════════════
   SABORES & RAÍZES — main.js (todo o comportamento do site)
   ───────────────────────────────────────────────────────────────────────
   MAPA DO jQuery (busque pelo símbolo ▸ para pular aos pontos de uso)
   ───────────────────────────────────────────────────────────────────────
   1. SELETORES ......... $('#id') · $('.classe') · $('a[href^="#"]') · $('.x:not(.y)')
   2. EVENTOS ........... .on('click'|'submit'|'scroll'|'keydown'|'mousemove'|'input')
   3. DELEGAÇÃO ......... .on(evento, '.filho', fn) → funciona p/ elementos criados depois
   4. MANIPULAÇÃO DOM ... .html() .text() .attr() .append() .data() .val() .remove()
   5. CLASSES ........... .addClass() .removeClass() .toggleClass()
   6. ANIMAÇÃO .......... .animate() → filtros, scroll suave, contadores
   7. EFEITOS ........... .fadeOut(callback) .hide() .stop() .one('load')
   8. ENCADEAMENTO ...... .css().addClass().animate() etc.
   9. AJAX .............. $.ajax() + $.when() + $.Deferred()
                          → fotos reais via API do Wikipédia (artigo)
                          E busca de arquivos no Commons (prato montado)
   O que NÃO é jQuery (nativo): requestAnimationFrame, localStorage,
   matchMedia, Array methods, setTimeout, regex, String.trim e o
   listener global de erro de imagens (document.addEventListener c/ capture).
   ═══════════════════════════════════════════════════════════════════════ */

/* ▸ jQuery: DOCUMENT READY — $(fn) registra a função para rodar
   quando o DOM terminou de carregar (forma curta de $(document).ready(fn)) */
 $(function(){
  /* GUARDA: se o CDN do lucide falhar, o site segue funcionando
     (sem ícones, mas com TODO o resto no lugar) */
  function icons(){ if(window.lucide){ lucide.createIcons(); } }
  icons();

  /* ═══════════════════════════════════════════════════════════
     SISTEMA DE FOTOS REAIS — duas fontes, uma orquestração
     ───────────────────────────────────────────────────────────
     FONTE A — foto do ARTIGO (prop=pageimages):
       ex.: artigo "Vatapá" → foto do vatapá.
       PEGADILHA: às vezes a foto do artigo é a MATÉRIA-PRIMA
       ("Carne de sol" = carne crua no açougue; "Pequi" = fruta).

     FONTE B — BUSCA de arquivos no Commons (generator=search,
       gsrnamespace=6 = namespace File): procura fotos do PRATO
       MONTADO. Receitas com `commons:[...]` usam esta fonte
       ANTES da foto do artigo.

     Ordem por receita: [busca no Commons] → [foto do artigo]
     → [Picsum com seed fixa]. Cache em localStorage.
     Foto SUA? Preencha photo:'URL' na receita — tem prioridade. */
  const API = 'https://pt.wikipedia.org/w/api.php';          // FONTE A
  const COMMONS = 'https://commons.wikimedia.org/w/api.php'; // FONTE B
  const IMG_CACHE_KEY = 'sr-wiki-imgs';
  const SEARCH_CACHE_KEY = 'sr-wiki-search';

  let IMGMAP = {}, SEARCHMAP = {};
  try{ IMGMAP = JSON.parse(localStorage.getItem(IMG_CACHE_KEY) || '{}') || {}; }catch(e){ IMGMAP = {}; }
  try{ SEARCHMAP = JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || '{}') || {}; }catch(e){ SEARCHMAP = {}; }

  /* Slots estáticos do layout: lista de artigos, o 1º com foto vence */
  const SLOTS = {
    heroMain:  ['Feijoada'],
    heroSmall: ['Fogueira','Fogão a lenha'],
    polaroid:  ['Panela de barro','Cerâmica','Barro'],
    raizFogo:  ['Fogão a lenha','Fogueira','Fogo'],
    raizMao:   ['Pão','Padaria','Culinária'],
    raizTerra: ['Mandioca','Pequi']
  };

  /* nativo: títulos que ainda não estão no cache */
  function pendingTitles(){
    const out = [];
    const push = function(t){ if(t && !IMGMAP[t] && out.indexOf(t) < 0) out.push(t); };
    Object.keys(SLOTS).forEach(function(k){ SLOTS[k].forEach(push); });
    RECIPES.forEach(function(r){ r.wiki.forEach(push); });
    return out;
  }
  /* nativo: buscas do Commons ainda não cacheadas */
  function collectSearchQueries(){
    const out = [];
    RECIPES.forEach(function(r){
      (r.commons || []).forEach(function(q){ if(out.indexOf(q) < 0) out.push(q); });
    });
    return out;
  }

  /* ▸ jQuery AJAX (FONTE A): $.ajax() devolve uma promise (jqXHR).
     origin=* libera o CORS · redirects=1 segue redirecionamentos
     pithumbsize=1200 pede a miniatura nessa largura
     titles.join('|') = lote: vários artigos numa requisição só */
  function fetchThumbs(titles){
    return $.ajax({
      url: API, dataType: 'json',
      data: { action:'query', format:'json', origin:'*', redirects:1,
              prop:'pageimages', piprop:'thumbnail', pithumbsize:1200,
              titles: titles.join('|') }
    });
  }
  /* ▸ jQuery AJAX (FONTE B): busca arquivos no Commons.
     gsrnamespace=6 → namespace File (só imagens).
     gsrsearch aceita aspas: '"carne de sol" macaxeira' = expressão
     exata + palavra. iiurlwidth=1200 pede thumb redimensionada. */
  function fetchCommonsSearch(q){
    return $.ajax({
      url: COMMONS, dataType: 'json',
      data: { action:'query', format:'json', origin:'*',
              generator:'search', gsrnamespace:6, gsrlimit:6, gsrsearch:q,
              prop:'imageinfo', iiprop:'url', iiurlwidth:1200 }
    });
  }

  /* parsing da FONTE A: a API pode normalizar acentos e seguir
     redirects — o título pedido pode não ser o que voltou.
     O alias reconstrói a cadeia p/ casar pedido ↔ resposta. */
  function parseThumbs(resp, need){
    const q = resp.query || {};
    const alias = {};
    (q.normalized || []).forEach(function(n){ alias[n.from] = n.to; });
    (q.redirects  || []).forEach(function(rd){ alias[rd.from] = rd.to; });
    const finalTitle = function(t){
      let cur = t, guard = 0;
      while(alias[cur] && guard++ < 5){ cur = alias[cur]; }
      return cur;
    };
    const byTitle = {};
    Object.keys(q.pages || {}).forEach(function(id){
      const p = q.pages[id];
      if(p.thumbnail && p.thumbnail.source){ byTitle[p.title] = p.thumbnail.source; }
    });
    need.forEach(function(t){
      const url = byTitle[finalTitle(t)];
      if(url){ IMGMAP[t] = url; }
    });
  }
  /* parsing da FONTE B: coleta até 5 fotos (jpg/png/webp) na ordem
     de relevância da busca (campo "index" da API) */
  function parseSearch(q, data){
    const pages = (data && data.query && data.query.pages) || {};
    const arr = Object.keys(pages).map(function(id){ return pages[id]; });
    arr.sort(function(a,b){ return (a.index || 99) - (b.index || 99); });
    const urls = [];
    arr.forEach(function(p){
      const info = p.imageinfo && p.imageinfo[0];
      if(!info) return;
      if(!/\.(jpe?g|png|webp)$/i.test(p.title || '')) return; // só foto raster
      const u = info.thumburl || info.url;
      if(u && urls.indexOf(u) < 0) urls.push(u);
    });
    if(urls.length){ SEARCHMAP[q] = urls; }
  }

  /* ▸ jQuery: $.when() espera TODAS as promises ao mesmo tempo;
     cada job é blindado (.then com falha→null) p/ uma API cair
     sem derrubar as outras. $.Deferred() cria a promise nossa
     que avisa "fotos resolvidas" pro resto do site (.then). */
  function resolveImages(){
    const dfd = $.Deferred();                       // ① promise própria
    const need = pendingTitles();
    const queries = collectSearchQueries();
    const jobs = [], meta = [];
    if(need.length){ jobs.push(fetchThumbs(need)); meta.push({t:'titles'}); }
    queries.forEach(function(q){ jobs.push(fetchCommonsSearch(q)); meta.push({t:'search', q:q}); });
    if(!jobs.length){ dfd.resolve(); return dfd.promise(); }
    const safe = jobs.map(function(j){
      return j.then(function(d){ return d; }, function(){ return null; }); // ② blindagem
    });
    $.when.apply($, safe).then(function(){          // ③ espera todas
      // ④ pegadinha do $.when: 1 promise = dados direto;
      //    N promises = um argumento por promise → normalizamos:
      const results = (jobs.length === 1) ? [arguments[0]] : Array.prototype.slice.call(arguments);
      results.forEach(function(data, i){
        if(!data) return;
        if(meta[i].t === 'titles'){ parseThumbs(data, need); }
        else{ parseSearch(meta[i].q, data); }
      });
      try{
        localStorage.setItem(IMG_CACHE_KEY, JSON.stringify(IMGMAP));
        localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(SEARCHMAP));
      }catch(e){}
      dfd.resolve();                                // ⑤ avisamos: terminou
    });
    return dfd.promise();                           // ⑥ quem chama usa .then()
  }

  /* fila de fotos de um slot estático (artigos na ordem, sem repetir) */
  function queueForSlot(name){
    const out = [];
    (SLOTS[name] || []).forEach(function(t){
      const u = IMGMAP[t];
      if(u && out.indexOf(u) < 0) out.push(u);
    });
    return out;
  }
  /* fila de fotos de uma receita:
     1) override manual (photo:'URL') — você manda, obedece
     2) resultados da busca no Commons (prato montado)
     3) artigos reserva (só se a busca não trouxe nada) */
  function candidatesFor(r){
    if(r.photo){ return [r.photo]; }
    const out = [];
    if(r.commons && r.commons.length){
      r.commons.forEach(function(q){
        (SEARCHMAP[q] || []).forEach(function(u){ if(out.indexOf(u) < 0) out.push(u); });
      });
    }
    if(!out.length){
      (r.wiki || []).forEach(function(t){
        const u = IMGMAP[t];
        if(u && out.indexOf(u) < 0) out.push(u);
      });
    }
    return out;
  }
  /* src + fallbacks de uma receita num objeto só.
     O Picsum é sempre o último da fila — nunca fica quebrado. */
  function dishPhoto(r, w, h){
    const picsum = 'https://picsum.photos/seed/sr-' + r.id + '/' + w + '/' + h + '.jpg';
    if(r.photoQueue && r.photoQueue.length){
      return { src: r.photoQueue[0], fb: r.photoQueue.slice(1).concat([picsum]) };
    }
    return { src: picsum, fb: [] };
  }

  /* setPhoto: aplica src + fila de fallback + FADE-IN.
     ▸ EFEITOS: .one('load', fn) dispara UMA vez quando carregar.
     Se já estava em cache (el.complete), revela direto — sem esse
     teste o evento 'load' não dispararia de novo e a foto ficaria
     invisível para sempre (bug clássico).
     ▸ [0] extrai o node DOM puro · return $img = ENCADEAMENTO */
  function setPhoto($img, src, fb){
    const el = $img[0];
    $img.attr('data-fallbacks', (fb || []).join('|'));
    $img.attr('src', src);
    $img.css('opacity', 0);
    const reveal = function(){ $img.css('opacity', ''); };
    if(el.complete && el.naturalWidth){ reveal(); }
    else{ $img.one('load', reveal); }
    return $img;
  }

  /* NATIVO e importante: o evento 'error' de <img> NÃO borbulha —
     por isso a delegação do jQuery NÃO funcionaria aqui. A solução
     é o listener nativo em CAPTURE (3º argumento true), que
     intercepta antes de qualquer coisa. A cada falha, consome o
     próximo fallback da fila do atributo data-fallbacks. */
  document.addEventListener('error', function(e){
    const el = e.target;
    if(el.tagName !== 'IMG' || !el.dataset.fallbacks) return;
    const parts = el.dataset.fallbacks.split('|').filter(Boolean);
    const next = parts.shift();
    el.dataset.fallbacks = parts.join('|');
    if(next){ el.src = next; }
  }, true);

  /* ============ DADOS DAS RECEITAS ============ */
  /* Campos de foto:
     wiki .... artigos reserva (foto de lead do verbete)
     commons . buscas no Commons por PRATO MONTADO (prioridade!)
     photo ... override manual — cole uma URL sua se quiser       */
  const RECIPES = [
    {id:'feijoada', num:'01', name:'Feijoada do Domingo', region:'sudeste', regionLabel:'Sudeste', time:'4h', servings:'8 pessoas', level:'Dedicada',
     wiki:['Feijoada'],
     desc:'A feijoada que começa de manhã cedo, quando o cheiro já toma a casa inteira e ninguém consegue ficar longe da cozinha.',
     ingredients:['1 kg de feijão preto','500 g de carne-seca dessalgada','400 g de costelinha de porco','300 g de paio em rodelas','300 g de linguiça calabresa','2 cebolas grandes picadas','6 dentes de alho amassados','2 folhas de louro','Laranja em rodelas, couve refogada e arroz branco para servir'],
     steps:['Deixe o feijão de molho na véspera. Dessalgue a carne-seca trocando a água por 24 horas.','Cozinhe o feijão na pressão com o louro por cerca de 40 minutos depois de pegar pressão.','Em outra panela, refogue a cebola e o alho até dourar e junte as carnes cortadas em pedaços.','Misture as carnes ao feijão e apure em fogo baixo por 1h30, mexendo de vez em quando.','Ajuste o sal e sirva com arroz branco, couve, farofa e rodelas de laranja.']},
    {id:'moqueca', num:'02', name:'Moqueca Capixaba', region:'sudeste', regionLabel:'Sudeste', time:'1h20', servings:'4 pessoas', level:'Equilibrada',
     wiki:['Moqueca','Moqueca capixaba','Peixe'],
     desc:'Sem leite de coco, sem dendê — só o urucum, a panela de barro e o respeito pelo peixe. Assim é a moqueca do Espírito Santo.',
     ingredients:['1,2 kg de badejo ou robalo em postas','Suco de 2 limões','3 tomates em rodelas','2 cebolas em rodelas','1 pimentão vermelho em tiras','2 colheres de azeite de oliva','1 colher de urucum (colorau)','Coentro fresco e sal a gosto'],
     steps:['Tempere o peixe com limão, sal e urucum e deixe marinar por 30 minutos.','Forre o fundo da panela de barro com metade das cebolas, tomates e pimentão.','Acomode as postas de peixe e cubra com o restante dos legumes.','Regue com azeite, tampe e cozinhe em fogo baixo por 25 minutos, sem mexer.','Salpique coentro fresco e sirva na própria panela com arroz branco e pirão.']},
    {id:'vatapa', num:'03', name:'Vatapá da Vó Zefa', region:'nordeste', regionLabel:'Nordeste', time:'1h40', servings:'6 pessoas', level:'Equilibrada',
     wiki:['Vatapá'],
     desc:'Cremoso, amarelo-ouro e perfumado. A receita da vó leva pão molhado no lugar de farinha — segredo que ela jurava ser baiano, mas ensinava em Recife.',
     ingredients:['500 g de pão amanhecido picado','400 ml de leite de coco','300 g de camarão seco','2 tomates e 1 cebola picados','1 pimentão amarelo','1 xícara de amendoim torrado e moído','1 xícara de castanha-de-caju moída','Gengibre, coentro e azeite de dendê a gosto'],
     steps:['Deixe o pão de molho no leite de coco até virar uma pasta grossa.','Bata no liquidificador o amendoim, a castanha, o tomate, a cebola, o pimentão e o gengibre.','Refogue essa massa no dendê por 10 minutos, em fogo baixo, mexendo sempre.','Junte a pasta de pão e o camarão seco e cozinhe por 25 minutos, sem parar de mexer.','Finalize com coentro e sirva com arroz branco.']},
    {id:'pao-queijo', num:'04', name:'Pão de Queijo da Roça', region:'sudeste', regionLabel:'Sudeste', time:'50min', servings:'20 unidades', level:'Simples',
     wiki:['Pão de queijo'],
     desc:'Crocante por fora, elástico por dentro. Daqueles que saem do forno e desaparecem antes de esfriar — receita de fazenda em Minas.',
     ingredients:['500 g de polvilho doce','250 ml de leite','200 ml de óleo','2 ovos','400 g de queijo meia-cura ralado','1 colher de chá de sal'],
     steps:['Ferva o leite com o óleo e o sal e escalde o polvilho, misturando bem.','Espere amornar e sove a massa com as mãos, incorporando os ovos um a um.','Acrescente o queijo ralado e sove até a massa ficar lenta e homogênea.','Faça bolinhas do tamanho de uma colher de servir e leve ao forno a 200°C por 25 minutos.','Retire quando dourarem e sirva ainda quentinho, com café coado no coador de pano.']},
    {id:'tacaca', num:'05', name:'Tacacá do Pará', region:'norte', regionLabel:'Norte', time:'45min', servings:'4 pessoas', level:'Equilibrada',
     wiki:['Tacacá','Tucupi','Jambu'],
     desc:'Servido na cuia, com tucupi amarelo e jambu que dorme a língua. O lanche da tarde que atravessa Belém desde sempre.',
     ingredients:['1 litro de tucupi (caldo da mandioca)','2 maços de jambu','400 g de camarão seco pequeno','1 dente de alho','Sal a gosto','Goma de mandioca preparada','Pimenta-de-cheiro para quem gosta'],
     steps:['Ferva o tucupi com alho e sal por 20 minutos — nunca antes, pois é cru.','Escalde o jambu em água fervente por 2 minutos e escorra.','Cozinhe a goma diluída até virar um gel transparente e corte em cubos.','Na cuia, monte: goma, tucupi quente, folhas de jambu e camarão seco por cima.','Ofereça a pimenta-de-cheiro à parte, como manda a tradição.']},
    {id:'barreado', num:'06', name:'Barreado Paranaense', region:'sul', regionLabel:'Sul', time:'6h', servings:'6 pessoas', level:'Dedicada',
     wiki:['Barreado'],
     desc:'Seis horas na panela de barro, lacrada com massa de farinha. O prato que faz Morretes parar no feriado — descanse, o fogo trabalha por você.',
     ingredients:['1,5 kg de coxão mole em cubos','2 cebolas picadas','6 dentes de alho','2 tomates picados','1 buquê de cheiro-verde','Cominho, pimenta-do-reino e louro','Farinha de mandioca para lacrar e para o pirão','Banana-da-terra frita para acompanhar'],
     steps:['Tempere a carne com todos os temperos e deixe descansar por 1 hora.','Coloque tudo na panela de barro com um copo de água e tampe lacrando a borda com massa de farinha e água.','Cozinhe em fogo baixíssimo por 6 horas, sem abrir de jeito nenhum.','Desfaça a carne com o garfo — ela deve virar quase uma pasta.','Sirva com pirão de farinha, arroz e banana frita.']},
    {id:'pequi', num:'07', name:'Arroz com Pequi', region:'centro-oeste', regionLabel:'Centro-Oeste', time:'1h', servings:'4 pessoas', level:'Simples',
     /* o artigo "Pequi" mostra a FRUTA — a busca acha o arroz pronto */
     photo:null,
     commons:['arroz pequi','pequi arroz prato'],
     wiki:['Pequi'],
     desc:'O ouro do cerrado. Quem prova uma vez passa a vida defendendo o pequi — e aprendendo a comer em volta do espinho.',
     ingredients:['2 xícaras de arroz','10 pequis congelados ou frescos','1 cebola picada','3 dentes de alho','2 colheres de óleo de pequi ou óleo comum','Sal e cheiro-verde a gosto'],
     steps:['Frite o pequi no óleo em fogo médio até soltar a cor amarela, cerca de 8 minutos.','Retire os pequis e, na mesma panela, refogue a cebola e o alho.','Junte o arroz e mexa para envolver no óleo amarelo.','Adicione 4 xícaras de água quente, os pequis de volta e sal.','Cozinhe em fogo baixo até secar e finalize com cheiro-verde.']},
    {id:'carne-sol', num:'08', name:'Carne de Sol com Mandioca', region:'nordeste', regionLabel:'Nordeste', time:'1h10', servings:'4 pessoas', level:'Simples',
     /* ═══ A CORREÇÃO DO AÇOUGUE ═══
        O artigo "Carne de sol" mostra a carne CRUA no balcão —
        banido da fila. Agora: busca por prato montado ("carne de
        sol com macaxeira", escondidinho) → artigo "Escondidinho"
        → Picsum. Quer uma foto sua? photo:'https://...' e pronto. */
     photo:null,
     commons:['"carne de sol" macaxeira','"carne de sol" mandioca','"escondidinho" carne'],
     wiki:['Escondidinho'],
     desc:'Carne dourada na manteiga de garrafa, mandioca macia e queijo coalho na brasa. Almoço de sábado no sertão, na mesa de quem chegou.',
     ingredients:['800 g de carne de sol em tiras finas','1 kg de mandioca cozida','200 g de queijo coalho','Manteiga de garrafa','1 cebola em rodelas','Manteiga e leite para o purê'],
     steps:['Dessalgue a carne em água por 2 horas, trocando a água no meio.','Cozinhe a mandioca até ficar macia e amasse com manteiga e um pouco de leite.','Grelhe a carne na própria gordura até dourar bem nas bordas.','Na mesma frigideira, doure o queijo coalho em fatias e a cebola na manteiga de garrafa.','Monte o prato: purê, carne por cima, queijo e cebola dourada.']}
  ];

  /* ============ ESTADO ============ */
  /* nativo: localStorage + JSON — persiste o caderno entre visitas */
  let notebook = [];
  try{ notebook = JSON.parse(localStorage.getItem('sr-notebook') || '[]') || []; }catch(e){ notebook = []; }
  const fine = window.matchMedia('(pointer:fine)').matches; // nativo: detecta mouse
  if(fine){ document.documentElement.classList.add('has-cursor'); }

  /* PATCH P4 — cache da altura da janela: $(window).height() era
     chamado a cada frame de scroll; agora só no resize (e no load) */
  let winH = $(window).height();                                  // ▸ .height()
  $(window).on('resize', function(){ winH = $(window).height(); });

  /* ============ PRELOADER ============ */
  /* nativo: setTimeout agenda; jQuery executa a saída (encadeamento:
     removeClass().addClass()) e depois remove o preloader do DOM */
  setTimeout(function(){
    $('#preloader').addClass('done');                               // ▸ CLASSES
    $('body').removeClass('loading').addClass('ready');             // ▸ CLASSES + ENCADEAMENTO
    setTimeout(function(){ $('#preloader').remove(); }, 1000);      // ▸ DOM: .remove()
  }, 1500);

  /* ============ RENDER DO ÍNDICE ============ */
  function rowsHTML(){
    // template string simples (nativo) — o jQuery injeta este HTML no #recipe-list
    return RECIPES.map(function(r){
      return '<div class="r-row reveal" role="button" tabindex="0" data-id="'+r.id+'" data-region="'+r.region+'" aria-label="Abrir receita '+r.name+'">'
        + '<span class="r-num mono">'+r.num+'</span>'
        + '<span class="r-name">'+r.name+'<i data-lucide="arrow-up-right" class="r-arrow"></i></span>'
        + '<span class="r-region mono"><span class="dot dot-'+r.region+'"></span>'+r.regionLabel+'</span>'
        + '<span class="r-time mono">'+r.time+'</span>'
        + '<span class="r-level mono">'+r.level+'</span>'
        + '<button class="save-btn" data-id="'+r.id+'" aria-label="Salvar '+r.name+' no caderno"><i data-lucide="bookmark"></i></button>'
        + '</div>';
    }).join('');
  }
  // ▸ jQuery: .html() gera as 8 linhas do índice de uma vez
  $('#recipe-list').html(rowsHTML());
  // ▸ jQuery: .each() + .attr() — grava um delay crescente (efeito cascata)
  $('.r-row').each(function(i){ $(this).attr('data-delay', i*50); });
  icons(); // re-converter os <i data-lucide> recém-injetados em <svg>

  /* ============ FILTROS ============ */
  function applyFilter(region){
    let d = 0, count = 0;
    $('.r-row').each(function(){                                   // ▸ .each()
      const $r = $(this).stop(true, true);   // ▸ EFEITOS: .stop(clearQueue, jumpToEnd)
      const match = (region === 'all') || ($r.data('region') === region);
      if(match){
        count++;
        setTimeout(function(){
          /* PATCH P2 — desligamos a transition CSS durante o .animate()
             (as .r-row são .reveal e têm transition de opacity no CSS;
             os dois motores brigavam e o fade saía "mole") */
          $r.addClass('in')
            .css({display:'', opacity:0, transition:'none'})       // ▸ .css() c/ objeto
            .animate({opacity:1}, 320, function(){                 // ▸ ANIMAÇÃO + callback
              $r.css('transition','');                             // religa a transition
            });
        }, d);
        d += 55;
      } else {
        $r.css('opacity', 1).hide();                               // ▸ EFEITOS: .hide()
      }
    });
    $('#list-count').text(String(count).padStart(2,'0') + (count === 1 ? ' receita' : ' receitas')); // ▸ DOM
  }
  $('.filter-btn').on('click', function(){                         // ▸ EVENTOS
    /* ▸ CLASSES: padrão "aba ativa" — remove de TODOS, põe no CLICADO */
    $('.filter-btn').removeClass('active');
    $(this).addClass('active');
    hideFloat();
    applyFilter($(this).data('region'));                           // ▸ DOM: .data()
  });

  /* ============ IMAGEM FLUTUANTE ============ */
  /* ▸ jQuery: seletor + [0] extrai o node nativo p/ comparar .src */
  const $float = $('#float-img'), floatImg = $('#float-img img')[0];
  function showFloat(r){
    if(!fine || window.innerWidth < 900) return;
    const ph = dishPhoto(r, 620, 460);
    if(floatImg.getAttribute('src') !== ph.src){
      setPhoto($('#float-img img'), ph.src, ph.fb); // foto real + fila de reserva
    }
    $float.addClass('on');                                         // ▸ CLASSES
  }
  function hideFloat(){ $float.removeClass('on'); }

  /* ▸ EVENTOS + DELEGAÇÃO: o bind vai no PAI (#recipe-list) com filtro
     '.r-row'. Obrigatório: as linhas nasceram via .html() DEPOIS do
     load — um bind direto não as encontraria.
     PATCH P3 — extraímos o id primeiro (mais legível que .bind(this)) */
  $('#recipe-list').on('mouseenter', '.r-row', function(){
    const id = $(this).data('id');                                 // ▸ .data() getter
    const r = RECIPES.find(function(x){ return x.id === id; });    // nativo
    if(r) showFloat(r);
  });
  $('#recipe-list').on('mouseleave', '.r-row', hideFloat);         // ▸ DELEGAÇÃO

/*TIRAR COMENTARIO
  function showToast(msg, icon){
    
    const $t = $('<div class="toast"><i data-lucide="'+(icon||'check')+'"></i><span>'+msg+'</span></div>');
    $('#toasts').append($t);                                       // ▸ DOM: .append()
    icons();
   
    requestAnimationFrame(function(){ $t.addClass('in'); });        // ▸ CLASSES
    
    setTimeout(function(){
      $t.removeClass('in');
      setTimeout(function(){ $t.remove(); }, 450);                 // ▸ DOM: .remove()
    }, 3000);
  }
TIRAR COMENTARIO*/
  /* ============ CADERNO (salvar receitas) ============ */
  function toggleSave(id){
    const r = RECIPES.find(function(x){ return x.id === id; });    // nativo
    if(!r) return;
    if(notebook.includes(id)){
      notebook = notebook.filter(function(x){ return x !== id; }); // nativo
      showToast('“'+r.name+'” saiu do caderno', 'trash-2');
    } else {
      notebook.push(id);
      showToast('“'+r.name+'” guardada no caderno', 'check');
    }
    try{ localStorage.setItem('sr-notebook', JSON.stringify(notebook)); }catch(e){}
    updateBadge(); renderNotebook(); refreshSaveButtons();
  }
  function updateBadge(){
    const $b = $('#nav-badge');
    if(notebook.length === 0){
      $b.hide();                                                   // ▸ EFEITOS: .hide()
    } else {
      $b.text(notebook.length).css('display','flex');              // ▸ ENCADEAMENTO
    }
  }
  function refreshSaveButtons(){
    /* ▸ CLASSES: .toggleClass(classe, BOOLEAN) — o 2º argumento decide
       liga/desliga. Sincroniza TODOS os botões com o estado numa linha */
    $('.save-btn').each(function(){
      $(this).toggleClass('saved', notebook.includes($(this).data('id')));
    });
    const openId = $('#modal-save').data('id');
    if(openId) syncModalSave(openId);
  }
  function renderNotebook(){
    $('#drawer-count').text(notebook.length ? notebook.length + (notebook.length === 1 ? ' receita' : ' receitas') : ''); // ▸ DOM: .text()
    if(notebook.length === 0){
      $('#drawer-items').html(                                     // ▸ DOM: .html()
        '<div class="empty"><i data-lucide="book-open"></i><strong>Caderno em branco</strong>'
        + '<span>Passe pelo índice e salve as receitas que te chamarem para a cozinha.</span></div>');
    } else {
      /* os itens nascem aqui → os cliques neles usam DELEGAÇÃO abaixo */
      $('#drawer-items').html(notebook.map(function(id){
        const r = RECIPES.find(function(x){ return x.id === id; });
        const ph = dishPhoto(r, 240, 180);
        return '<div class="nb-item" data-id="'+r.id+'">'
          + '<img loading="lazy" src="' + ph.src + '" alt=""'
          + (ph.fb.length ? ' data-fallbacks="' + ph.fb.join('|') + '"' : '') + '>'
          + '<div class="nb-info"><strong>'+r.name+'</strong><span class="mono">'+r.regionLabel+' — '+r.time+'</span></div>'
          + '<button class="nb-del" data-id="'+r.id+'" aria-label="Remover do caderno"><i data-lucide="trash-2"></i></button>'
          + '</div>';
      }).join(''));
    }
    icons();
  }
  // ▸ DELEGAÇÃO: os .nb-del ainda não existiam quando a página carregou
  $('#drawer-items').on('click', '.nb-del', function(e){
    e.stopPropagation(); // nativo: impede que o clique suba p/ o .nb-item
    toggleSave($(this).data('id'));
  });
  $('#drawer-items').on('click', '.nb-item', function(){           // ▸ DELEGAÇÃO
    openRecipe($(this).data('id'));
  });

  /* ============ MODAL ============ */
  function openRecipe(id){
    const r = RECIPES.find(function(x){ return x.id === id; });    // nativo
    if(!r) return;
    hideFloat();
    /* ▸ ENCADEAMENTO: setPhoto devolve o objeto → .attr('alt') na sequência */
    const ph = dishPhoto(r, 1200, 700);
    setPhoto($('#modal-img'), ph.src, ph.fb)
      .attr('alt', 'Foto do prato: ' + r.name);
    $('#modal-num').text('Receita Nº '+r.num);                     // ▸ DOM: .text()
    $('#modal-region').text(r.regionLabel);
    $('#modal-dot').attr('class', 'dot dot-'+r.region);            // ▸ DOM: .attr() setter
    $('#modal-name').text(r.name);
    $('#modal-desc').text(r.desc);
    $('#modal-time').text(r.time);
    $('#modal-servings').text(r.servings);
    $('#modal-level').text(r.level);
    $('#modal-ingredients').html(r.ingredients.map(function(i){ return '<li>'+i+'</li>'; }).join('')); // ▸ .html()
    $('#modal-steps').html(r.steps.map(function(s){ return '<li>'+s+'</li>'; }).join(''));
    $('#recipe-modal').addClass('open');                           // ▸ CLASSES
    $('#scrim').addClass('on');
    $('body').addClass('locked');                                  // trava o scroll
    $('.modal-card').scrollTop(0);     /* ▸ jQuery: DUALIDADE getter/setter —
        com argumento é setter (vá para a posição). Reseta a rolagem
        interna do card ao abrir outra receita */
    syncModalSave(r.id);
  }
  function syncModalSave(id){
    const saved = notebook.includes(id);                           // nativo
    /* ▸ ENCADEAMENTO em cadeia: .toggleClass().data().html()
       (o .data('id', id) aqui é SETTER — grava qual receita o botão é) */
    $('#modal-save').toggleClass('is-saved', saved).data('id', id)
      .html(saved
        ? '<i data-lucide="bookmark-check"></i><span>Salva no caderno</span>'
        : '<i data-lucide="bookmark"></i><span>Salvar no caderno</span>');
    icons();
  }/* TIRAR COMENTÁRIO
  // ▸ DELEGAÇÃO: cliques nas linhas do índice (criadas via .html())
  $('#recipe-list').on('click', '.r-row', function(){ openRecipe($(this).data('id')); });
  // acessibilidade por teclado
  $('#recipe-list').on('keydown', '.r-row', function(e){
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); openRecipe($(this).data('id')); }
  });
  // ▸ DELEGAÇÃO: stopPropagation impede que o bookmark abra o modal também
  $('#recipe-list').on('click', '.save-btn', function(e){
    e.stopPropagation();
    toggleSave($(this).data('id'));
  });
  $('#modal-save').on('click', function(){ toggleSave($(this).data('id')); }); // ▸ EVENTOS
  $('#modal-close').on('click', closeAll);
   TIRAR COMENTÁRIO */
  /* ============ DRAWER ============ */
  function openDrawer(){
    renderNotebook();
    $('#drawer').addClass('open');                                 // ▸ CLASSES
    $('#scrim').addClass('on');
    $('body').addClass('locked');
  }
  $('#open-notebook').on('click', openDrawer);
  $('#drawer-close').on('click', closeAll);
  $('#scrim').on('click', closeAll);
  /* ▸ EVENTOS: keydown no $(document) inteiro — ESC fecha tudo */
  $(document).on('keydown', function(e){ if(e.key === 'Escape') closeAll(); });
  function closeAll(){
    /* um único ponto de verdade: nenhum estado fica órfão */
    $('#recipe-modal').removeClass('open');
    $('#drawer').removeClass('open');
    $('#scrim').removeClass('on');
    $('body').removeClass('locked');
    $('#mobile-menu').removeClass('open');
    $('#menu-toggle').removeClass('open');
  }

  /* ============ MENU MOBILE ============ */
  $('#menu-toggle').on('click', function(){
    $('#mobile-menu').toggleClass('open');                         // ▸ CLASSES
    $(this).toggleClass('open');                                   // hambúrguer ↔ X
  });
  $('#mobile-menu a').on('click', function(){
    $('#mobile-menu').removeClass('open');
    $('#menu-toggle').removeClass('open');
    $('body').removeClass('locked');
  });

  /* ============ ÂNCORAS SUAVES ============ */
  /* ▸ SELETOR DE ATRIBUTO [href^="#"]: links que COMEÇAM com #
     ▸ ANIMAÇÃO: $('html,body').animate({scrollTop}) — a técnica
       clássica de smooth scroll do jQuery (html p/ Firefox,
       body p/ Chrome antigo; os dois cobrem tudo) */
  $('a[href^="#"]').on('click', function(e){
    const href = $(this).attr('href');                             // ▸ .attr() getter
    /* ▸ jQuery como teste de existência: $(sel).length > 0 = existe */
    if(href.length > 1 && $(href).length){
      e.preventDefault(); // nativo: cancela o salto bruto
      /* ▸ .offset().top = posição absoluta no documento (não da janela).
         O -55 compensa a nav fixa de 72px */
      $('html,body').animate({ scrollTop: $(href).offset().top - 55 }, 850); // ▸ ANIMAÇÃO
    }
  });
  $('#back-top').on('click', function(){
    $('html,body').animate({ scrollTop: 0 }, 900);                 // ▸ ANIMAÇÃO
  });

  /* ============ NEWSLETTER ============ */
  $('#nl-form').on('submit', function(e){                          // ▸ EVENTOS: submit
    e.preventDefault(); // nativo: impede o reload da página
    /* PATCH P1 — $.trim() está deprecado desde o jQuery 3.5.
       Hoje o trim nativo de String faz o mesmo: */
    const v = $('#nl-email').val().trim();                         // ▸ .val() getter
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)){                  // nativo: regex
      $('#nl-error').text('Hmm, esse e-mail não parece completo — confere pra mim?').addClass('show'); // ▸ ENCADEAMENTO
      $('#nl-email').addClass('shake');                            // ▸ CLASSES
      setTimeout(function(){ $('#nl-email').removeClass('shake'); }, 500);
      return;
    }
    $('#nl-error').removeClass('show');
    /* ▸ EFEITOS: .fadeOut(duração, CALLBACK) — o sucesso só aparece
       QUANDO o fade termina (o callback sequencia as ações) */
    $(this).fadeOut(200, function(){ $('#nl-success').addClass('show'); });
    showToast('Carta confirmada — bem-vindo à mesa!', 'mail-check');
  });
  $('#nl-email').on('input', function(){ $('#nl-error').removeClass('show'); }); // ▸ 'input' = a cada tecla

  /* ============ SCROLL: nav, progresso, reveals, contadores ============ */
  /* nativo: requestAnimationFrame + flag 'ticking' limitam o handler
     a 1 execução por frame (o scroll dispara dezenas de vezes/s) */
  let ticking = false;
  function onScroll(){
    const st = $(window).scrollTop();                              // ▸ .scrollTop() getter
    $('#site-nav').toggleClass('scrolled', st > 40);               // ▸ toggle CONDICIONAL
    const dh = $(document).height() - winH;                        // nativo + cache P4
    $('#progress').css('width', (dh > 0 ? (st/dh)*100 : 0) + '%'); // ▸ DOM: .css()

    /* REVEALS — ▸ SELETOR COM :not(): pega só quem ainda não entrou.
       Conforme recebe .in, sai da consulta → o trabalho diminui */
    $('.reveal:not(.in)').each(function(){
      if($(this).offset().top < st + winH * 0.9){
        /* ▸ ENCADEAMENTO: .css('transition-delay',...) + .addClass('in') */
        $(this).css('transition-delay', ($(this).data('delay') || 0) + 'ms').addClass('in');
      }
    });

    /* CONTADORES — truque clássico: animar um OBJETO comum $({v:0})
       em vez de um elemento DOM. O callback 'step' roda a cada frame
       do .animate() e escreve o número no HTML via .text() */
    $('.stat-num:not(.done)').each(function(){
      if($(this).offset().top < st + winH * 0.9){
        $(this).addClass('done');                                  // marca como animado
        const target = +$(this).data('target'), $el = $(this);     // +unário: string→número
        $({v:0}).animate({v:target}, {                             // ▸ objeto "fantasma"
          duration: 1600, easing: 'swing',
          step: function(){ $el.text(Math.round(this.v)); },       // ▸ DOM a cada frame
          complete: function(){ $el.text(target); }                // garante valor final
        });
      }
    });
    ticking = false;
  }
  $(window).on('scroll', function(){                               // ▸ EVENTOS: scroll
    if(!ticking){ ticking = true; requestAnimationFrame(onScroll); }
  });
  onScroll(); // 1ª execução revela o que já está visível no load

  /* ============ CURSOR + IMAGEM FLUTUANTE (loop único) ============ */
  if(fine){
    /* interpolação suave (lerp) — nativo: variáveis + rAF.
       jQuery LÊ o mouse e ESCREVE as posições na tela */
    let mx = innerWidth/2, my = innerHeight/2;
    let rx = mx, ry = my, fx = mx, fy = my;
    /* ▸ EVENTOS: mousemove no document — só grava coords (barato).
       O trabalho pesado acontece 1x por frame no loop abaixo */
    $(document).on('mousemove', function(e){ mx = e.clientX; my = e.clientY; });
    const $dot = $('#cursor-dot'), $ring = $('#cursor-ring');
    (function loop(){
      rx += (mx - rx) * .18;  ry += (my - ry) * .18;   // anel persegue
      fx += (mx - fx) * .14;  fy += (my - fy) * .14;   // foto persegue mais devagar
      const rot = Math.max(-9, Math.min(9, (mx - fx) * .08)); // inclina c/ velocidade
      const cx = Math.min(fx + 26, innerWidth - 316);
      const cy = Math.min(fy + 26, innerHeight - 240);
      $dot.css({ left: mx, top: my });                 // ▸ .css() c/ OBJETO
      $ring.css({ left: rx, top: ry });
      $float.css('transform', 'translate(' + cx + 'px,' + cy + 'px) rotate(' + rot + 'deg)');
      requestAnimationFrame(loop);                     // nativo: ~60x/s
    })();
    /* ▸ EVENTOS + DELEGAÇÃO na raiz: qualquer a/button/[role]/input
       (presente OU futuro) liga/desliga .cursor-hot no body.
       mouseenter/mouseleave do jQuery NÃO disparam nos filhos
       (os nativos mouseover/mouseout disparariam — flicker) */
    $(document).on('mouseenter', 'a, button, [role="button"], input', function(){ $('body').addClass('cursor-hot'); });
    $(document).on('mouseleave', 'a, button, [role="button"], input', function(){ $('body').removeClass('cursor-hot'); });
  } else {
    $('#cursor-dot, #cursor-ring').remove();           // ▸ SELETOR MÚLTIPLO + .remove()
  }

  /* ═══════════════ ORQUESTRAÇÃO DAS FOTOS ═══════════════ */
  function applyStaticPhotos(){
    /* ▸ SELETOR DE ATRIBUTO + .each(): cada <img data-slot> acha seu artigo.
       Vai-e-vem jQuery↔nativo: 'this' (node) p/ ler el.dataset,
       $(el) p/ voltar aos métodos jQuery */
    $('.js-photo[data-slot]').each(function(){
      const el = this;
      const q = queueForSlot(el.dataset.slot);
      const picsum = 'https://picsum.photos/seed/sr-' + el.dataset.slot + '/'
                   + el.dataset.w + '/' + el.dataset.h + '.jpg';
      setPhoto($(el), q[0] || picsum, (q[0] ? q.slice(1) : []).concat([picsum]));
    });
  }
  resolveImages().then(function(){                     // ▸ promise do $.Deferred
    applyStaticPhotos();
    /* monta a fila de fotos de cada receita (busca → artigo) e pré-carrega */
    RECIPES.forEach(function(r){ r.photoQueue = candidatesFor(r); }); // nativo
    RECIPES.forEach(function(r){
      const p = dishPhoto(r, 620, 460);
      if(p.src.indexOf('picsum') < 0) new Image().src = p.src; // pré-cache do hover
    });
    renderNotebook(); // redesenha o caderno com as fotos corretas
  });

  /* estado inicial — desenha badge e caderno com o localStorage */
  updateBadge();
  renderNotebook();
});
