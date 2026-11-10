(function(){
"use strict";
var C=window.QCARE||{};
var $=function(s){return document.querySelector(s)};
var esc=function(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})};
var hex=function(c,d){return /^#[0-9a-fA-F]{6}$/.test(c)?c:d};
var BLANK="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
var pic=function(u){u=String(u||"");return (/^https:\/\/[^\s"'<>]+$/.test(u)||/^assets\/[\w\-\/.]+$/.test(u))?u:BLANK};
var RM=matchMedia("(prefers-reduced-motion:reduce)").matches;
var msg=function(t){return "https://wa.me/"+String(C.wa||"").replace(/\D/g,"")+"?text="+encodeURIComponent(t)};
var inr=function(n){return "₹"+Math.round(n).toLocaleString("en-IN")};
var slugOf=function(n){return String(n).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")};
function ls(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k));localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}

/* ---------- backend ---------- */
var ON=!!(C.supabaseUrl&&C.supabaseKey);
function rpc(fn,body,ms){
  var ctl=new AbortController(),t=setTimeout(function(){ctl.abort()},ms||8000);
  var h={"Content-Type":"application/json",apikey:C.supabaseKey};
  if(/^eyJ/.test(C.supabaseKey))h.Authorization="Bearer "+C.supabaseKey;
  return fetch(String(C.supabaseUrl).replace(/\/+$/,"")+"/rest/v1/rpc/"+fn,{method:"POST",headers:h,body:JSON.stringify(body||{}),signal:ctl.signal})
    .then(function(r){return r.json().then(function(j){
      if(!r.ok){var e=new Error((j&&j.message)||"Request failed");e.api=r.status===400&&j&&j.code==="P0001";throw e}
      return j})})
    .finally(function(){clearTimeout(t)});
}
function nice(e){
  var m=(e&&e.message)||"",k=m.split(":")[0],r=m.slice(k.length+1);
  var M={OUT_OF_STOCK:"Sorry, we don’t have that many of "+r+" in stock. Please reduce the quantity.",
    ITEM_UNAVAILABLE:"One item in your cart is no longer available. Please remove it and try again.",
    CART_INVALID:"Something is wrong with the cart. Please refresh the page and try again.",
    TOO_MANY:"Too many requests just now. Please try again later or message us on WhatsApp.",
    CLOSED:"We’re not taking website orders right now. Please message us on WhatsApp.",
    COUPON:r,INVALID:"Please check your "+r+"."};
  return M[k]||"Something went wrong. Please try again.";
}

/* ---------- catalogue (built-in copy is used only if the backend can't be reached) ---------- */
var FB={settings:{accepting_orders:true,ship_near:50,ship_far:80,ship_slab:25,slab_g:500,free_over:999,home_pin:"400605",gst_enabled:false,gst_rate:5,gstin:""},
  products:[["Jasmine","#FBF6E3","#25251F"],["Cinnamon","#A9683A","#6B3A1A"],["Sandalwood","#D2A770","#3A2A22"],["Mix Fruit","#D8505E","#B0262F"],["Orange","#F29A3A","#E8731A"],["Lavender","#A895D8","#5B4BA3"],["Rose","#E0858F","#B5302B"],["Musk","#C9A6C4","#46464F"],["Aqua","#7BC1D8","#1B6A9C"],["Vanilla","#F3E3B4","#2A2A26"]].map(function(f){
    var s=slugOf(f[0]);return {slug:s,name:f[0],description:"",tag:"",color:f[1],accent:f[2],image_url:"assets/labels/"+s+".webp",
      variants:[{sku:s+"-normal",label:"Normal",price:80,weight_g:100,in_stock:true},{sku:s+"-premium",label:"Premium",price:100,weight_g:100,in_stock:true}]}})};
var P=[],SET=FB.settings,V={},F=[],LB=[],live=false;
function use(cat,isLive){
  P=((cat&&cat.products)||[]).filter(function(p){return p&&p.slug&&p.variants&&p.variants.length});
  SET=Object.assign({},FB.settings,(cat&&cat.settings)||{});live=isLive;V={};
  P.forEach(function(p,i){p.variants.forEach(function(v){v.price=+v.price||0;v.weight_g=+v.weight_g||100;V[v.sku]={i:i,p:p,v:v}})});
  F=P.map(function(p){return [p.name,hex(p.color,"#D9C79A"),hex(p.accent,"#3A2A22")]});
  LB=P.map(function(p){return pic(p.image_url)});
}

var vel=0,hook=function(){},cur=0;
var pick=$("#pick"),grid=$("#grid"),fn=$("#fname"),dots=[];
var cart=[],wish=[],orders=[],code="",Q=null,qsig="",qtm=0,qerr="",cref=null,busy=false;
var dr=$("#dr"),pdE=$("#pd");

function sel(i){if(!F.length)return;cur=i;dots.forEach(function(b,j){b.setAttribute("aria-pressed",j===i)});fn.textContent=F[i][0]+" · "+(C.sizeText||"");hook(i)}

/* ---------- static bits that don't need the catalogue ---------- */
document.querySelectorAll("[data-wa]").forEach(function(a){a.href=msg(a.dataset.wa);a.target="_blank";a.rel="noopener"});
var OCC=["Birthday gifting","Wedding return gifts","Corporate gifting","Anniversary gifts","Festive gift hampers","Personalised candles"];
OCC.forEach(function(n,k){
  var a=document.createElement("a");a.className="occ tilt";a.href=msg("Hi QCare, I’d like to enquire about "+n.toLowerCase()+".");a.target="_blank";a.rel="noopener";
  a.innerHTML="<h3>"+n+"</h3>"+(k===5?"<span style='color:var(--soft);font-size:14px'>Names, messages or custom packaging</span>":"")+"<small>Enquire on WhatsApp →</small>";$("#og").appendChild(a);
  var o=document.createElement("option");o.textContent=n;$("#go").appendChild(o);
});
var tel=String(C.phone||"").replace(/\s/g,"");
$("#ci").innerHTML=(C.phone?'Phone: <a href="tel:'+esc(tel)+'">'+esc(C.phone)+"</a><br>":"")+(C.email?'Email: <a href="mailto:'+esc(C.email)+'">'+esc(C.email)+"</a>":"")+(C.address?"<br>Address: "+esc(C.address)+'<br><a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(C.address)+'" target="_blank" rel="noopener">Open in Google Maps</a>':"");
$("#fq").textContent="WhatsApp or call "+(C.phone||"us")+(C.email?", or email "+C.email:"")+".";
$("#so").innerHTML=[["Instagram",C.ig],["Facebook",C.fb],["Google",C.gmb]].filter(function(x){return /^https:\/\//.test(x[1]||"")}).map(function(x){return '<a href="'+esc(x[1])+'" target="_blank" rel="noopener">'+x[0]+"</a>"}).join("");

var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target)}})},{threshold:.12});
document.querySelectorAll(".rv").forEach(function(el){io.observe(el)});
function tilt(el){if(RM||!matchMedia("(hover:hover)").matches)return;
  el.addEventListener("pointermove",function(e){var b=el.getBoundingClientRect(),x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;el.style.transform="perspective(800px) rotateX("+(-y*14)+"deg) rotateY("+(x*14)+"deg) translateY(-4px)"});
  el.addEventListener("pointerleave",function(){el.style.transform=""})}
document.querySelectorAll(".tilt").forEach(tilt);

var root=document.documentElement,tm=$("#tm"),mq=matchMedia("(prefers-color-scheme:dark)");
var SUN='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',MOON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>';
function eff(){return root.dataset.theme||(mq.matches?"dark":"light")}
function tdraw(){var d=eff()==="dark";tm.setAttribute("aria-label",d?"Switch to light mode":"Switch to dark mode");tm.innerHTML=d?SUN:MOON}
tm.onclick=function(){var n=eff()==="dark"?"light":"dark";root.dataset.theme=n;try{localStorage.setItem("qc_theme",n)}catch(e){}tdraw()};
mq.addEventListener("change",tdraw);tdraw();
var mn=$("#mn"),nv=$("#nv");
mn.onclick=function(){var o=nv.classList.toggle("open");mn.setAttribute("aria-expanded",o);mn.setAttribute("aria-label",o?"Close menu":"Open menu")};
nv.addEventListener("click",function(e){if(e.target.closest("a")){nv.classList.remove("open");mn.setAttribute("aria-expanded","false")}});

/* ---------- enquiries: WhatsApp opens at once, a copy is saved for the admin ---------- */
function enquire(kind,name,phone,email,details,text,hp){
  if(hp)return false;
  open(msg(text),"_blank","noopener");
  if(ON)rpc("submit_enquiry",{p:{kind:kind,name:name,phone:phone,email:email||"",details:details}}).catch(function(){});
  return true;
}
$("#f").addEventListener("submit",function(e){e.preventDefault();var f=e.target,n=$("#n").value.trim(),m=$("#m").value.trim();
  enquire("contact",n,"","",{message:m},"Hi QCare, I’m "+n+". "+m,f.website.value)});
$("#bf").addEventListener("submit",function(e){e.preventDefault();var f=e.target;
  var d={fragrance:f.bfr.value,quantity:f.bq.value,customisation:f.bc.value,packaging:f.bk.value,delivery_date:f.bd.value,address:f.ba.value,instructions:f.bi.value};
  var t="Bulk order enquiry\nName: "+f.bn.value+"\nPhone: "+f.bp.value+"\nEmail: "+f.be.value+"\nFragrance: "+d.fragrance+"\nQuantity: "+d.quantity+"\nCustomisation: "+d.customisation+"\nPackaging: "+d.packaging+"\nPreferred delivery date: "+(d.delivery_date||"-")+"\nDelivery address: "+d.address+(d.instructions?"\nInstructions: "+d.instructions:"");
  if(enquire("bulk",f.bn.value.trim(),f.bp.value,f.be.value.trim(),d,t,f.website.value))$("#bm").textContent="Thank you. WhatsApp has opened with your enquiry. Send it and our team will confirm manually. Payment: 50% advance at confirmation, 50% before dispatch."});
$("#gf").addEventListener("submit",function(e){e.preventDefault();var f=e.target;
  var d={occasion:f.go.value,fragrance:f.gfr.value,quantity:f.gq.value,packaging:f.gk.value,wrapping:f.gw.value,message_card:f.gc.value,multiple_addresses:f.gma.checked?"Yes":"No",personalisation:f.gp.value};
  var t="Gifting enquiry\nOccasion: "+d.occasion+"\nFragrance: "+d.fragrance+"\nQuantity: "+d.quantity+"\nPackaging: "+d.packaging+"\nGift wrapping: "+d.wrapping+"\nMessage card: "+d.message_card+"\nMultiple delivery addresses: "+d.multiple_addresses+"\nPersonalisation: "+d.personalisation+"\nName: "+f.gn.value+"\nPhone: "+f.gt.value;
  if(enquire("gift",f.gn.value.trim(),f.gt.value,"",d,t,f.website.value))$("#gm").textContent="WhatsApp has opened with your enquiry. Send it and we’ll get back to you."});

/* ---------- catalogue rendering ---------- */
function render(){
  pick.innerHTML="";grid.innerHTML="";dots=[];
  P.forEach(function(p,i){
    var b=document.createElement("button");b.type="button";b.setAttribute("aria-label",p.name);b.innerHTML='<span class="dot" style="background:'+F[i][1]+'"></span>';b.onclick=function(){sel(i)};pick.appendChild(b);dots.push(b);
    var c=document.createElement("div");c.className="card tilt";c.style.setProperty("--c",F[i][1]);
    c.innerHTML='<button type="button" class="vw" aria-label="View '+esc(p.name)+' in 3D"><img class="lab" alt="" width="108" height="108" loading="lazy" src="'+esc(LB[i])+'"></button>'+(p.tag?'<span class="tagb">'+esc(p.tag)+"</span>":"")+"<b>"+esc(p.name)+"</b><small>"+esc(C.sizeText||"")+'</small><div class="ro">'+
      p.variants.map(function(v){return '<button type="button" class="btn ad" data-s="'+esc(v.sku)+'"'+(v.in_stock?"":" disabled")+">"+esc(v.label)+" "+(v.in_stock?inr(v.price):"· Sold out")+"</button>"}).join("")+
      "</div>"+(SET.gst_enabled?'<small class="pr">GST included</small>':"")+'<button type="button" class="dl">View details</button><button type="button" class="hr" aria-label="Save '+esc(p.name)+'" aria-pressed="false">♡</button>';
    c.querySelector(".vw").onclick=function(){sel(i);scrollTo({top:0,behavior:RM?"auto":"smooth"})};
    c.querySelector(".dl").onclick=function(){openP(i)};
    c.querySelectorAll(".ad").forEach(function(b){b.onclick=function(){add(b.dataset.s)}});
    c.querySelector(".hr").onclick=function(){var k=wish.indexOf(p.slug);if(k>-1)wish.splice(k,1);else wish.push(p.slug);ls("qc_wish",wish);wl()};
    grid.appendChild(c);tilt(c);
  });
  ["#bfr","#gfr"].forEach(function(id){var s=$(id);s.innerHTML="";P.map(function(p){return p.name}).concat(["Assorted mix"]).forEach(function(n){var o=document.createElement("option");o.textContent=n;s.appendChild(o)})});
  var all=[];P.forEach(function(p){p.variants.forEach(function(v){all.push(v)})});
  var by={};all.forEach(function(v){(by[v.label]=by[v.label]||{})[v.price]=1});
  var same=Object.keys(by).length<=3&&Object.keys(by).every(function(l){return Object.keys(by[l]).length===1});
  var pr=all.length?(same?Object.keys(by).map(function(l){return l+" "+inr(+Object.keys(by[l])[0])}).join(" · ")+" each":"From "+inr(Math.min.apply(null,all.map(function(v){return v.price})))):"";
  $("#csub").textContent=(pr?"41 ml jar candles · "+pr+(SET.gst_enabled?", GST included":"")+". ":"")+"Tap a label to see it in 3D.";
  $("#tl").textContent=(all.length?"From "+inr(Math.min.apply(null,all.map(function(v){return v.price})))+" · ":"")+"Delivery across India · Pay by UPI";
  $("#gmsg").textContent=P.length?"":"Our collection is being updated. Please message us on WhatsApp to order.";
  $("#gsn").textContent=SET.gst_enabled&&SET.gstin?" · GSTIN "+SET.gstin:"";
  $("#dn").textContent=(SET.gst_enabled?"Prices include "+(+SET.gst_rate)+"% GST. ":"")+"Payment is by UPI: we send the QR on WhatsApp after you place the order.";
}
function wl(){document.querySelectorAll("#grid .card").forEach(function(c,i){var on=wish.indexOf(P[i].slug)>-1,h=c.querySelector(".hr");c.classList.toggle("on",on);h.textContent=on?"♥":"♡";h.setAttribute("aria-pressed",on)});$("#wf").textContent="Saved ("+wish.length+")"}
$("#wf").onclick=function(){grid.classList.toggle("sv")};

/* ---------- product drawer ---------- */
function closeP(){pdE.hidden=true;if(P.some(function(p){return "#"+p.slug===location.hash}))history.replaceState(null,"",location.pathname+location.search)}
function openP(i,keep){var p=P[i];$("#pt").textContent=p.name+" Scented Candle";
  $("#pb").innerHTML='<img src="'+esc(LB[i])+'" alt="'+esc(p.name)+' label" width="200" height="200" style="border-radius:50%;align-self:center">'+(p.description?"<p>"+esc(p.description)+"</p>":"")+'<p class="em">41 ml jar · Net 20 g, as printed on the label</p><div class="pay" role="radiogroup" aria-label="Candle type">'+
    p.variants.map(function(v,k){return '<label><input type="radio" name="pt" value="'+esc(v.sku)+'"'+(v.in_stock?"":" disabled")+(k===p.variants.findIndex(function(x){return x.in_stock})?" checked":"")+"> "+esc(v.label)+" scented candle: "+(v.in_stock?inr(v.price):"sold out")+"</label>"}).join("")+
    '</div><small class="em">'+(SET.gst_enabled?"Prices include "+(+SET.gst_rate)+"% GST. ":"")+'Shipping is calculated at checkout.</small><label for="pq">Quantity</label><input id="pq" type="number" min="1" max="200" value="1"><div class="r2"><button class="btn o" type="button" data-a="add">Add to cart</button><button class="btn" type="button" data-a="add">Buy now</button></div><div class="r2"><button class="btn o" type="button" data-a="v3">See it in 3D</button><button class="btn o" type="button" data-a="sh">Share</button></div><h4>Candle care</h4><ul class="cl"><li>Trim the wick to about 5 mm before each burn.</li><li>Never leave a burning candle unattended.</li><li>Keep away from children, pets and anything flammable.</li></ul>';
  $("#pb").dataset.i=i;pdE.hidden=false;$("#px").focus();if(!keep)location.hash=p.slug}
$("#pb").addEventListener("click",function(e){var b=e.target.closest("[data-a]");if(!b)return;var i=+$("#pb").dataset.i,a=b.dataset.a;
  if(a==="add"){var r=document.querySelector("#pb input[name=pt]:checked");if(!r)return;var q=Math.min(200,Math.max(1,Math.floor(+$("#pq").value)||1));closeP();add(r.value,q)}
  if(a==="v3"){closeP();sel(i);scrollTo({top:0,behavior:RM?"auto":"smooth"})}
  if(a==="sh"){var d={title:P[i].name+" Scented Candle - QCare Candles",url:location.href};if(navigator.share)navigator.share(d).catch(function(){});else if(navigator.clipboard){navigator.clipboard.writeText(d.url);b.textContent="Link copied"}}});
$("#px").onclick=closeP;pdE.addEventListener("click",function(e){if(e.target===pdE)closeP()});
function hashOpen(){var h=location.hash.slice(1),i=P.map(function(p){return p.slug}).indexOf(h);if(i>-1){if(pdE.hidden||+$("#pb").dataset.i!==i)openP(i,true)}else pdE.hidden=true}
addEventListener("hashchange",hashOpen);

/* ---------- cart ---------- */
function openCart(){dr.hidden=false;draw();$("#dx").focus()}
function closeCart(){dr.hidden=true}
$("#cb").onclick=openCart;$("#dx").onclick=closeCart;
dr.addEventListener("click",function(e){if(e.target===dr)closeCart()});
addEventListener("keydown",function(e){if(e.key==="Escape"){closeCart();if(!pdE.hidden)closeP()}});
function add(sku,q){if(!V[sku]||!V[sku].v.in_stock)return;var l=cart.filter(function(x){return x.s===sku})[0];if(l)l.q=Math.min(200,l.q+(q||1));else cart.push({s:sku,q:q||1});$("#done").innerHTML="";save();openCart()}
function save(){ls("qc_cart",cart);cref=null;qerr="";draw()}
function pinV(){return $("#pin").value.trim()}
function pinOk(){return /^[1-9]\d{5}$/.test(pinV())}
function items(){return cart.map(function(l){return {sku:l.s,qty:l.q}})}
function sig(){return JSON.stringify([cart,pinOk()?pinV():"",code])}
function local(){var sub=0,w=0;cart.forEach(function(l){var v=V[l.s].v;sub+=v.price*l.q;w+=v.weight_g*l.q});
  var sh=null;if(pinOk())sh=(SET.free_over>0&&sub>=SET.free_over)?0:(pinV()[0]===String(SET.home_pin)[0]?SET.ship_near:SET.ship_far)+SET.ship_slab*(Math.max(1,Math.ceil(w/SET.slab_g))-1);
  return {sub:sub,d:0,sh:sh,tot:sh==null?null:sub+sh,tax:SET.gst_enabled?sub*SET.gst_rate/(100+ +SET.gst_rate):0,cp:null,cerr:null}}
function totals(){if(Q&&qsig===sig())return {sub:Q.subtotal,d:Q.discount,sh:Q.shipping,tot:Q.total,tax:+Q.gst_included||0,cp:Q.coupon,cerr:Q.coupon_error,srv:true};return local()}
function requote(){clearTimeout(qtm);if(!live||!cart.length||qsig===sig())return;var s=sig();
  qtm=setTimeout(function(){rpc("quote_order",{p_items:items(),p_pin:pinOk()?pinV():null,p_coupon:code||null}).then(function(q){if(s===sig()){Q=q;qsig=s;qerr="";draw()}},function(e){if(s===sig()&&e.api){qerr=nice(e);draw(true)}})},350)}
function draw(noq){var c=totals(),n=cart.reduce(function(a,l){return a+l.q},0);$("#cc").textContent=n;
  $("#dl").innerHTML=cart.length?cart.map(function(l,k){var x=V[l.s];return '<div class="li"><img src="'+esc(LB[x.i])+'" alt="" width="48" height="48"><div><b>'+esc(x.p.name)+"</b><small>"+esc(x.v.label)+" candle · "+inr(x.v.price)+'</small></div><div class="qt"><button type="button" data-k="'+k+'" data-d="-1" aria-label="Fewer">−</button><span>'+l.q+'</span><button type="button" data-k="'+k+'" data-d="1" aria-label="More">+</button></div></div>'}).join(""):($("#done").innerHTML?"":'<p class="em">Your cart is empty. Add a fragrance to begin.</p>');
  $("#cx").hidden=!cart.length;
  $("#tt").innerHTML=cart.length?"<div><span>Subtotal"+(SET.gst_enabled?" (incl. GST)":"")+"</span><span>"+inr(c.sub)+"</span></div>"+(c.d?"<div><span>Coupon ("+esc(c.cp)+")</span><span>−"+inr(c.d)+"</span></div>":"")+(SET.gst_enabled?'<div class="gs"><span>GST included ('+(+SET.gst_rate)+"%)</span><span>"+inr(c.tax)+"</span></div>":"")+"<div><span>Shipping</span><span>"+(c.sh==null?"Enter PIN":(c.sh?inr(c.sh):"Free"))+'</span></div><div class="gt"><span>Total</span><span>'+(c.tot==null?"—":inr(c.tot))+"</span></div>":"";
  $("#qe").textContent=qerr;
  if(code)$("#cm").textContent=c.srv?(c.cerr||(c.d?c.cp+" applied: you save "+inr(c.d)+".":"")):(live?"Checking…":"Coupons can’t be checked right now.");
  $("#oh").innerHTML=orders.slice(-3).reverse().map(function(o){return '<div class="li"><div><b>'+esc(o.id)+"</b><small>"+esc(o.d)+" · "+inr(o.t)+'</small></div><button type="button" class="btn o" data-r="'+esc(o.id)+'">Reorder</button></div>'}).join("")||'<p class="em">No past orders on this device yet.</p>';
  if(!noq)requote()}
$("#dl").onclick=function(e){var b=e.target.closest("button");if(!b)return;var k=+b.dataset.k;cart[k].q=Math.min(200,cart[k].q+ +b.dataset.d);if(cart[k].q<1)cart.splice(k,1);save()};
$("#oh").onclick=function(e){var b=e.target.closest("[data-r]");if(!b)return;var o=orders.filter(function(x){return x.id===b.dataset.r})[0];if(o)o.l.forEach(function(l){add(l.s,l.q)})};
$("#ca").onclick=function(){code=$("#cp").value.trim().toUpperCase().slice(0,20);if(!code)$("#cm").textContent="";draw()};
$("#pin").oninput=function(){draw()};

/* ---------- checkout: order is saved and priced by the server, payment QR follows on WhatsApp ---------- */
function uuid(){if(crypto.randomUUID)return crypto.randomUUID();var b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;var h=Array.prototype.map.call(b,function(x){return (x+256).toString(16).slice(1)}).join("");return h.slice(0,8)+"-"+h.slice(8,12)+"-"+h.slice(12,16)+"-"+h.slice(16,20)+"-"+h.slice(20)}
$("#co").addEventListener("submit",function(e){e.preventDefault();if(busy)return;var f=e.target,say=function(t){$("#cm2").textContent=t};
  var ph=f.ph.value.replace(/\D/g,"").replace(/^91(?=\d{10}$)/,"").replace(/^0(?=\d{10}$)/,"");
  var d={name:f.nm.value.trim(),phone:ph,email:f.em.value.trim(),addr_line1:f.a1.value.trim(),addr_line2:f.a2.value.trim(),city:f.ct.value.trim(),state:f.st.value.trim(),pin:pinV(),note:f.nt.value.trim(),coupon:code||null,website:f.website.value,items:items()};
  if(!cart.length)return say("Your cart is empty.");
  if(!pinOk())return say("Enter a valid 6-digit PIN code above.");
  if(d.name.length<2)return say("Please enter your full name.");
  if(!/^[6-9]\d{9}$/.test(ph))return say("Please enter a valid 10-digit mobile number.");
  if(d.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email))return say("Please check your email address.");
  if(d.addr_line1.length<3||d.city.length<2||d.state.length<2)return say("Please complete your delivery address.");
  if(qerr)return say(qerr);
  var t=totals(),snap=cart.map(function(l){return {s:l.s,q:l.q}});
  if(!live)return finish(null,t,d,snap);
  if(!SET.accepting_orders)return say(nice({message:"CLOSED"}));
  cref=cref||uuid();d.client_ref=cref;busy=true;$("#pb2").disabled=true;say("Placing your order…");
  rpc("place_order",{p:d},12000).then(function(r){finish(r,t,d,snap)},function(err){if(err.api&&!/^TOO_MANY/.test(err.message))say(nice(err));else{say("");finish(null,t,d,snap)}})
    .then(function(){busy=false;$("#pb2").disabled=false});
});
function finish(r,t,d,snap){
  var lines=snap.map(function(l){var x=V[l.s];return "• "+x.p.name+" ("+x.v.label+") × "+l.q}).join("\n"),text,id,total;
  if(r){id=r.order_no;total=r.total;
    text="Hi QCare, I’ve placed order "+id+" on the website.\n"+lines+"\nTotal: "+inr(total)+"\nName: "+d.name+"\nPlease send me the UPI QR to pay.";
  }else{id="WA-"+Date.now().toString(36).toUpperCase().slice(-6);total=t.tot;
    text="New order "+id+" (not saved on the website, please confirm the total)\n"+lines+"\nSubtotal "+inr(t.sub)+"\nShipping "+(t.sh?inr(t.sh):"Free")+"\nTotal "+inr(t.tot)+"\nName: "+d.name+"\nPhone: "+d.phone+(d.email?"\nEmail: "+d.email:"")+"\nAddress: "+[d.addr_line1,d.addr_line2,d.city,d.state].filter(Boolean).join(", ")+" - "+d.pin+(d.note?"\nPersonalisation: "+d.note:"")+"\nPlease send me the UPI QR to pay.";}
  orders.push({id:id,d:new Date().toLocaleDateString("en-IN"),t:total,l:snap});orders=orders.slice(-10);ls("qc_orders",orders);
  $("#done").innerHTML='<div class="okp"><h4>'+(r?"Order "+esc(id)+" received":"Almost done")+'</h4><span class="big">Amount to pay: '+inr(total)+"</span><ol><li>Tap the button below to send "+(r?"your order number":"your order")+" to us on WhatsApp.</li><li>We reply with a UPI QR code for "+inr(total)+".</li><li>Pay, and we confirm and dispatch your order.</li></ol>"+'<a class="btn" target="_blank" rel="noopener" href="'+esc(msg(text))+'">Send on WhatsApp to get your payment QR</a>'+(r?'<small class="em">Keep your order number. You can track it here under “Track an order”.</small>':"")+"</div>";
  cart=[];code="";Q=null;qsig="";$("#co").reset();$("#cp").value="";$("#cm").textContent="";$("#cm2").textContent="";save();
  if(r)$("#to").value=id;
  $("#done").scrollIntoView({block:"nearest"});
}
var STL={pending_payment:"Awaiting payment",paid:"Payment received",processing:"Being packed",shipped:"Shipped",delivered:"Delivered",cancelled:"Cancelled",returned:"Returned to us",refunded:"Refunded"};
$("#tf").addEventListener("submit",function(e){e.preventDefault();var o=$("#tr");
  if(!live){o.textContent="Tracking isn’t available right now. Please message us on WhatsApp.";return}
  o.textContent="Checking…";
  rpc("track_order",{p_order_no:$("#to").value,p_phone:$("#tp").value}).then(function(r){
    o.textContent=r?r.order_no+": "+(STL[r.status]||r.status)+(r.courier?" · "+r.courier+(r.awb?" · Tracking no. "+r.awb:""):"")+" · "+inr(r.total):"We couldn’t find an order with that number and mobile number."},
    function(){o.textContent="Couldn’t check just now. Please try again."})});

/* ---------- boot ---------- */
function boot(){
  var oc=ls("qc_cart")||[],ow=ls("qc_wish")||[],oo=ls("qc_orders")||[];
  var old=function(l){return l&&l.s?l:(l&&typeof l.i==="number"&&FB.products[l.i]?{s:FB.products[l.i].slug+"-"+String(l.pk||"Normal").toLowerCase(),q:l.q}:null)};
  cart=oc.map(old).filter(function(l){return l&&V[l.s]&&l.q>0}).map(function(l){return {s:l.s,q:Math.min(200,Math.floor(l.q))}});
  wish=ow.map(function(w){return typeof w==="number"?(FB.products[w]||{}).slug:w}).filter(function(w){return P.some(function(p){return p.slug===w})});
  orders=oo.filter(function(o){return o&&o.id&&o.l}).map(function(o){o.l=o.l.map(old).filter(function(l){return l&&V[l.s]});return o});
  render();wl();draw();
  if(F.length){init3D();sel(0)}
  hashOpen();
}
function init3D(){
try{
  var gl=$("#gl");
  var R=new THREE.WebGLRenderer({antialias:true,alpha:true});R.setPixelRatio(Math.min(devicePixelRatio,2));gl.appendChild(R.domElement);
  var S=new THREE.Scene(),cam=new THREE.PerspectiveCamera(32,1,.1,60),G=new THREE.Group();G.position.y=-1.2;S.add(G);var FG=new THREE.Group();FG.position.y=-1.2;S.add(FG);
  S.add(new THREE.HemisphereLight(0xfff3dc,0x3a2c1c,.95));
  var dl=new THREE.DirectionalLight(0xffffff,.8);dl.position.set(3,5,6);S.add(dl);var rl=new THREE.DirectionalLight(0x9fc4ff,.5);rl.position.set(-4,3,-5);S.add(rl);
  var fl=new THREE.PointLight(0xffb060,1.5,9,2);fl.position.set(0,2.1,0);G.add(fl);
  var AD=THREE.AdditiveBlending;
  var M=function(g,m,y){var o=new THREE.Mesh(g,m);o.position.y=y||0;G.add(o);return o};
  var cyl=function(a,b,h,o,ts,tl){return new THREE.CylinderGeometry(a,b,h,64,1,o,ts,tl)};
  function radTex(col){var c=document.createElement("canvas");c.width=c.height=128;var g=c.getContext("2d"),r=g.createRadialGradient(64,64,0,64,64,64);r.addColorStop(0,col);r.addColorStop(1,col.replace(/[\d.]+\)$/,"0)"));g.fillStyle=r;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)}
  function flameTex(){var c=document.createElement("canvas");c.width=128;c.height=256;var g=c.getContext("2d");g.translate(64,170);g.scale(1,1.7);var r=g.createRadialGradient(0,0,0,0,0,60);r.addColorStop(0,"rgba(255,255,255,1)");r.addColorStop(.25,"rgba(255,236,160,.95)");r.addColorStop(.6,"rgba(255,150,40,.55)");r.addColorStop(1,"rgba(255,100,20,0)");g.fillStyle=r;g.fillRect(-64,-100,128,200);return new THREE.CanvasTexture(c)}

  var V2=function(a){return a.map(function(p){return new THREE.Vector2(p[0],p[1])})};
  var DS=THREE.DoubleSide,lit=true,L=0,LO=0,smoke=0,sacc=0,dist=0,q1=new THREE.Quaternion(),U={t:{value:0},k:{value:1}},FLM=[];
  var FS=`varying vec2 vUv;uniform float t,k,s;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
void main(){float y=vUv.y,tt=t+s;
float sw=(n(vec2(y*2.4-tt*2.6,tt*.8))-.5)*.5*y;
float x=(vUv.x-.5)*2.+sw;
float w=pow(clamp(1.-y,0.,1.),1.15)*smoothstep(-.02,.2,y)*.5;
w*=.92+.16*n(vec2(tt*4.,y*5.));
float d=abs(x)/max(w,.001);
float a=smoothstep(1.,.15,d)*smoothstep(1.,.78,y)*smoothstep(0.,.03,y);
float core=smoothstep(.62,0.,d)*(1.-smoothstep(0.,.62,y));
vec3 c=mix(vec3(1.,.38,.04),vec3(1.,.82,.35),smoothstep(0.,.9,core*1.4));
c=mix(c,vec3(1.,.98,.85),core*core);
c+=vec3(.18,.38,1.)*smoothstep(.2,0.,y)*(1.-d)*.9;
gl_FragColor=vec4(c,a*k);}`;
  function mkFlame(p,y,sc){var g=new THREE.PlaneGeometry(.62,1.25);g.translate(0,.625,0);
    var m=new THREE.Mesh(g,new THREE.ShaderMaterial({uniforms:{t:U.t,k:U.k,s:{value:Math.random()*20}},transparent:true,depthWrite:false,blending:AD,side:DS,vertexShader:"varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",fragmentShader:FS}));
    m.position.y=y;m.scale.setScalar(sc);m.renderOrder=5;p.add(m);FLM.push(m);return m}

  var E=new THREE.Scene(),ec=document.createElement("canvas");ec.width=1024;ec.height=512;
  var eg=ec.getContext("2d"),egr=eg.createLinearGradient(0,0,0,512);egr.addColorStop(0,"#3b2a1b");egr.addColorStop(.5,"#140d08");egr.addColorStop(1,"#050403");eg.fillStyle=egr;eg.fillRect(0,0,1024,512);
  [[140,110,220,200,"#fff1da"],[520,70,300,170,"#ffffff"],[860,150,110,260,"#ffc57a"],[0,262,1024,5,"rgba(255,255,255,.4)"],[380,300,120,60,"#ffd9a0"]].forEach(function(b){eg.fillStyle=b[4];eg.fillRect(b[0],b[1],b[2],b[3])});
  E.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(ec),side:THREE.BackSide})));
  var pmg=new THREE.PMREMGenerator(R);S.environment=pmg.fromScene(E,.02,.1,100).texture;pmg.dispose();

  G.add(new THREE.Mesh(new THREE.LatheGeometry(V2([[0,.02],[1.35,.02],[1.5,.07],[1.68,.12],[1.76,.09],[1.74,0],[1.66,-.08],[0,-.08]]),96),new THREE.MeshStandardMaterial({color:0xc9a66b,metalness:.55,roughness:.42,side:DS,envMapIntensity:1.2})));
  var sh=new THREE.Mesh(new THREE.CircleGeometry(2.6,48),new THREE.MeshBasicMaterial({map:radTex("rgba(0,0,0,.5)"),transparent:true,depthWrite:false}));sh.rotation.x=-Math.PI/2;sh.position.y=-.13;G.add(sh);
  var fg=new THREE.Mesh(new THREE.CircleGeometry(3.4,48),new THREE.MeshBasicMaterial({map:radTex("rgba(255,160,60,.7)"),transparent:true,blending:AD,depthWrite:false}));fg.rotation.x=-Math.PI/2;fg.position.y=-.1;G.add(fg);

  var LT=[],ldr=new THREE.TextureLoader();LB.forEach(function(u,i){LT[i]=ldr.load(u);LT[i].anisotropy=8});
  var TH=3.6;
  var jg=new THREE.LatheGeometry(V2([[0,.02],[.82,.02],[.92,.05],[.97,.12],[1,.22],[1,1],[.97,1.17],[.9,1.29],[.87,1.36],[.88,1.42],[.865,1.46],[.88,1.5],[.865,1.54],[.89,1.57],[.9,1.58],[.84,1.58],[.8,1.56],[.8,1.4],[.84,1.28],[.93,1],[.93,.3],[.91,.24],[0,.22]]),128);
  var lg=new THREE.LatheGeometry(V2([[0,.272],[.62,.272],[.67,.29],[.9,.3],[.96,.285],[.99,.23],[.99,.05],[.965,0],[.93,0],[.93,.24],[0,.24]]),96);
  var gc=document.createElement("canvas");gc.width=2;gc.height=256;var gg=gc.getContext("2d"),gr=gg.createLinearGradient(0,0,0,256);gr.addColorStop(0,"#ffffff");gr.addColorStop(.35,"#9a9a9a");gr.addColorStop(1,"#222222");gg.fillStyle=gr;gg.fillRect(0,0,2,256);
  var GT=new THREE.CanvasTexture(gc);
  var GM=new THREE.MeshPhongMaterial({color:0xcfe6dc,transparent:true,opacity:.14,shininess:220,specular:0xffffff,side:DS,depthWrite:false});
  var RFM=new THREE.MeshStandardMaterial({color:0xffffff,metalness:1,roughness:.04,transparent:true,opacity:.7,blending:AD,depthWrite:false,envMapIntensity:.9});
  var LM=new THREE.MeshStandardMaterial({color:0x0b0b0b,metalness:.55,roughness:.28,envMapIntensity:1.5,side:DS});
  function mkLab(){var cv=document.createElement("canvas");cv.width=2048;cv.height=420;var tx=new THREE.CanvasTexture(cv);tx.anisotropy=8;return {cv:cv,tx:tx}}
  function drawLab(o,i){var g=o.cv.getContext("2d"),W=2048,H=420,ink="#1d1a14";g.clearRect(0,0,W,H);
    g.fillStyle="rgba(255,250,235,.3)";g.fillRect(0,0,W,H);
    g.fillStyle=ink;g.fillRect(0,8,W,10);g.fillRect(0,H-18,W,10);g.fillRect(W-14,8,14,H-16);
    g.fillStyle="#3E6B41";[[150,58,-.5],[188,64,.9]].forEach(function(l){g.beginPath();g.ellipse(l[0],l[1],12,28,l[2],0,7);g.fill()});
    g.textAlign="left";g.font='500 60px "Playfair Display",Georgia,serif';g.fillText("QCare",96,134);
    var n=F[i][0],z=124;g.fillStyle=ink;g.font='700 '+z+'px "Playfair Display",Georgia,serif';
    while(g.measureText(n).width>760){z-=6;g.font='700 '+z+'px "Playfair Display",Georgia,serif'}
    g.fillText(n,100,254);
    g.font='600 27px Inter,Arial,sans-serif';g.fillText("HAND POURED AROMA CANDLE",104,296);
    g.font='700 36px Inter,Arial,sans-serif';g.fillText("NET QTY: 20g/",240,342);
    g.font='italic 400 34px Inter,Arial,sans-serif';g.fillText("100 % Handmade with Love",180,390);
    g.strokeStyle=F[i][2];g.globalAlpha=.45;g.lineWidth=5;
    for(var k=0;k<6;k++){g.beginPath();g.moveTo(1560+k*55,H-30);g.quadraticCurveTo(1520+k*60,240,1600+k*58,70+k*24);g.stroke()}
    g.globalAlpha=1;o.tx.needsUpdate=true}
  function mkJar(){var g=new THREE.Group();
    var wx=new THREE.Mesh(new THREE.LatheGeometry(V2([[0,.24],[.9,.24],[.925,.3],[.925,1],[.835,1.28],[0,1.28]]),96),new THREE.MeshStandardMaterial({color:F[0][1],roughness:.5,side:DS,emissive:new THREE.Color(F[0][1]),emissiveMap:GT,emissiveIntensity:.6}));g.add(wx);
    var pl=new THREE.Mesh(new THREE.CircleGeometry(.82,64),new THREE.MeshPhysicalMaterial({color:F[0][1],roughness:.06,clearcoat:1,clearcoatRoughness:.05,emissive:0x331a00,emissiveIntensity:.5}));pl.rotation.x=-Math.PI/2;pl.position.y=1.283;g.add(pl);
    var lb=mkLab(),lm=new THREE.Mesh(new THREE.CylinderGeometry(1.012,1.012,.74,96,1,true,-.31*TH,TH),new THREE.MeshStandardMaterial({map:lb.tx,transparent:true,roughness:.7,depthWrite:false}));lm.position.y=.62;g.add(lm);
    g.add(new THREE.Mesh(jg,GM));g.add(new THREE.Mesh(jg,RFM));
    var ld=new THREE.Group();ld.position.y=1.34;ld.add(new THREE.Mesh(lg,LM));
    var sm=new THREE.MeshStandardMaterial({map:LT[0],transparent:true,alphaTest:.5,roughness:.5}),st=new THREE.Mesh(new THREE.CircleGeometry(.6,48),sm);st.rotation.x=-Math.PI/2;st.position.y=.275;ld.add(st);g.add(ld);
    return {g:g,wx:wx,pl:pl,lb:lb,ld:ld,sm:sm}}
  var J=mkJar();G.add(J.g);var wax=J.wx,pool=J.pl;
  var LGp=new THREE.Group();LGp.position.y=-1.2;S.add(LGp);var LD=J.ld;J.g.remove(LD);LGp.add(LD);
  var wk=M(cyl(.022,.03,.3,false),new THREE.MeshStandardMaterial({color:0x1b1410,roughness:1}),1.41);wk.rotation.z=.05;
  var tip=M(new THREE.SphereGeometry(.04,10,10),new THREE.MeshBasicMaterial({color:0xff7a1a}),1.56);
  mkFlame(G,1.5,1.1);

  var SMK=[];for(var qi=0;qi<14;qi++){var ss=new THREE.Sprite(new THREE.SpriteMaterial({map:radTex("rgba(225,220,214,.55)"),transparent:true,depthWrite:false,opacity:0}));ss.userData={a:9,p:Math.random()*6};ss.visible=false;G.add(ss);SMK.push(ss)}
  var PG=new THREE.Group();PG.position.y=-1.2;S.add(PG);var PT=[],pgm=new THREE.CircleGeometry(.11,10);
  var pms=[0x4F7A54,0x6FA070,0x2E5B35,0xD9C79A].map(function(c){return new THREE.MeshStandardMaterial({color:c,roughness:.7,side:DS,emissive:c,emissiveIntensity:.25})});
  for(var pj=0;pj<34;pj++){var pt=new THREE.Mesh(pgm,pms[pj%4]);pt.scale.set(.8,1.5,1);pt.position.set((Math.random()-.5)*8,Math.random()*6,(Math.random()-.5)*3.5-.5);pt.rotation.set(Math.random()*6,Math.random()*6,Math.random()*6);pt.userData={p:Math.random()*6,v:.18+Math.random()*.2,r:[Math.random()*2,Math.random()*2,Math.random()*2]};PG.add(pt);PT.push(pt)}
  function toggle(){lit=!lit;$("#lt").textContent=lit?"Blow out the candle":"Light the candle";if(!lit)smoke=2.6}
  $("#lt").onclick=toggle;

  var fm=new THREE.Sprite(new THREE.SpriteMaterial({map:flameTex(),blending:AD,depthWrite:false,transparent:true}));fm.position.set(0,2.2,0);G.add(fm);
  var gw=new THREE.Sprite(new THREE.SpriteMaterial({map:radTex("rgba(255,170,70,.9)"),blending:AD,depthWrite:false,transparent:true,opacity:.45}));gw.position.set(0,2.1,0);gw.scale.set(4,4,1);G.add(gw);fm.visible=false;

  var SD=[];
  [-1,1].forEach(function(sg,k){var J2=mkJar();J2.g.position.set(sg*2.3,0,-.2);J2.g.scale.setScalar(.46);J2.wx.material.emissiveIntensity=.25;FG.add(J2.g);SD.push({J:J2,k:k,col:new THREE.Color(F[0][1]),tgt:new THREE.Color(F[0][1])})});
  function refresh(i){drawLab(J.lb,i);J.sm.map=LT[i];J.sm.needsUpdate=true;SD.forEach(function(d,k){var j=(i+(k?1:F.length-1))%F.length;drawLab(d.J.lb,j);d.J.sm.map=LT[j];d.J.sm.needsUpdate=true})}
  if(document.fonts)document.fonts.ready.then(function(){refresh(cur)});
  var N=140,pp=new Float32Array(N*3),i;
  for(i=0;i<N;i++){pp[i*3]=(Math.random()-.5)*7;pp[i*3+1]=Math.random()*5-1;pp[i*3+2]=(Math.random()-.5)*4}
  var pg=new THREE.BufferGeometry();pg.setAttribute("position",new THREE.BufferAttribute(pp,3));
  G.add(new THREE.Points(pg,new THREE.PointsMaterial({map:radTex("rgba(255,255,255,1)"),color:0xe9e6b0,size:.14,transparent:true,opacity:.8,blending:AD,depthWrite:false})));

  function rs(){var w=gl.clientWidth,h=gl.clientHeight;if(!w||!h)return;R.setSize(w,h,false);cam.aspect=w/h;FG.visible=cam.aspect>=.9;var d=Math.max(7.6,(FG.visible?5.7:4.3)/(.574*cam.aspect));cam.position.set(0,2.1,d);cam.lookAt(0,.25,0);cam.updateProjectionMatrix()}
  new ResizeObserver(rs).observe(gl);rs();

  var rot=0,drag=false,lx=0,tilt=0,tt=0,vis=true,last=performance.now(),col=new THREE.Color(F[0][1]),tgt=new THREE.Color(F[0][1]),auto=RM?0:.35;
  vel=auto;
  hook=function(i){tgt.set(F[i][1]);refresh(i);vel=RM?0:7;SD.forEach(function(d,k){d.tgt.set(F[(i+(k?1:F.length-1))%F.length][1])})};
  new IntersectionObserver(function(e){vis=e[0].isIntersecting}).observe(gl);
  gl.addEventListener("click",function(){if(dist<6)toggle()});
  gl.addEventListener("pointerdown",function(e){drag=true;dist=0;lx=e.clientX;gl.setPointerCapture(e.pointerId)});
  gl.addEventListener("pointermove",function(e){var b=gl.getBoundingClientRect();tt=((e.clientY-b.top)/b.height-.5)*.3;if(drag){dist+=Math.abs(e.clientX-lx);rot+=(e.clientX-lx)*.012;lx=e.clientX}});
  var up=function(){drag=false};gl.addEventListener("pointerup",up);gl.addEventListener("pointercancel",up);gl.addEventListener("pointerleave",function(){tt=0});

  function loop(now){
    requestAnimationFrame(loop);
    var dt=Math.min((now-last)/1000,.05);last=now;if(!vis)return;var t=now/1000;
    if(!drag)rot+=vel*dt;vel+=(auto-vel)*Math.min(1,dt*2);
    col.lerp(tgt,Math.min(1,dt*6));wax.material.color.copy(col);wax.material.emissive.copy(col);pool.material.color.copy(col);
    tilt+=(tt-tilt)*Math.min(1,dt*4);
    G.rotation.y=rot+scrollY*.003;G.rotation.x=tilt;G.position.y=-1.2+Math.sin(t*.9)*.03;LGp.position.y=G.position.y;
    fm.scale.set(.58+.03*Math.sin(t*13)+.02*Math.sin(t*29),1.08+.07*Math.sin(t*11+1)+.04*Math.sin(t*23),1);fm.material.rotation=.04*Math.sin(t*9);
    var lidT=(lit||smoke>0||L>.12)?1:0;LO+=(lidT-LO)*Math.min(1,dt*2.4);var e=LO*LO*(3-2*LO);
    LD.position.set(1.6*e,1.34-1.32*e+Math.sin(e*3.14159)*1.5,1.85*e);LD.rotation.set(tilt*(1-e),e*.5,-Math.sin(e*3.14159)*.5);
    L+=(((lit&&LO>.75)?1:0)-L)*Math.min(1,dt*(lit?4:7));U.t.value=t;U.k.value=L;
    fl.intensity=(1.4+.25*Math.sin(t*17)+.15*Math.sin(t*31))*L;gw.material.opacity=(.42+.05*Math.sin(t*14))*L;fg.material.opacity=(.55+.1*Math.sin(t*14))*L;
    wax.material.emissiveIntensity=.12+.55*L;tip.material.color.setRGB(.2+.8*L,.1+.3*L,.04);
    FLM.forEach(function(m){m.parent.getWorldQuaternion(q1);q1.invert();m.quaternion.copy(q1.multiply(cam.quaternion))});
    if(!RM)PT.forEach(function(m){var u=m.userData;m.position.y-=u.v*dt;m.position.x+=Math.sin(t*.8+u.p)*.25*dt;m.rotation.x+=u.r[0]*dt;m.rotation.y+=u.r[1]*dt;m.rotation.z+=u.r[2]*dt*.5;if(m.position.y<-1.4){m.position.y=5;m.position.x=(Math.random()-.5)*8}});
    if(smoke>0){smoke-=dt;sacc+=dt;if(sacc>.16){sacc=0;var sp=SMK.find(function(m){return !m.visible});if(sp){sp.userData.a=0;sp.visible=true;sp.position.set(0,1.62,0)}}}
    SMK.forEach(function(m){if(!m.visible)return;var u=m.userData;u.a+=dt;m.position.y+=dt*.5;m.position.x+=Math.sin(u.a*2.6+u.p)*dt*.22;var sc=.22+u.a*.5;m.scale.set(sc,sc,1);m.material.opacity=.5*Math.max(0,1-u.a/3.2);if(u.a>3.2)m.visible=false});
    if(!RM){for(var k=0;k<N;k++){pp[k*3+1]+=dt*.12;if(pp[k*3+1]>4)pp[k*3+1]=-1.5}pg.attributes.position.needsUpdate=true}
    FG.rotation.y=Math.sin(t*.5)*.22;
    SD.forEach(function(d){d.col.lerp(d.tgt,Math.min(1,dt*5));d.J.wx.material.color.copy(d.col);d.J.wx.material.emissive.copy(d.col);d.J.pl.material.color.copy(d.col)});
    R.render(S,cam);
  }
  requestAnimationFrame(loop);
}catch(err){$("#gl").innerHTML='<p class="fb">The 3D preview needs WebGL. You can still browse the collection below.</p>'}
}
if(ON)rpc("get_catalog",{},5000).then(function(c){use(c,true)},function(){use(FB,false)}).then(boot);
else{use(FB,false);boot()}
})();
