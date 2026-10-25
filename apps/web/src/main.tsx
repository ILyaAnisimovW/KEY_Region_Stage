import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { auth, getMe, signIn, SESSION_HINT, type Me } from './auth';
import './style.css';
import { Catalog, MyBookings, StaffBookings } from './BookingViews';

const BakeryScene = React.lazy(() => import('./BakeryScene'));

let callbackError = '';
let postAuthPage: 'home' | 'account' = 'account';
if (location.pathname === '/callback') {
  try {
    const response = await auth.signinRedirectCallback();
    if (response.state && typeof response.state === 'object' && 'intent' in response.state && response.state.intent === 'register') {
      postAuthPage = 'home';
    }
  }
  catch (e) {
    localStorage.removeItem(SESSION_HINT);
    const code = e && typeof e === 'object' && 'error' in e ? e.error : '';
    if (code !== 'login_required' && code !== 'interaction_required') callbackError = 'Не удалось завершить вход. Попробуйте ещё раз.';
  }
  history.replaceState({}, '', '/');
}
type IconName = 'arrow'|'bag'|'clock'|'leaf'|'user'|'shop'|'check'|'close'|'menu'|'logout'|'refresh'|'shield';
function Icon({name,size=22}:{name:IconName;size?:number}) {
  const paths:Record<IconName,React.ReactNode>={
    arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>, bag:<><path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/></>,
    clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, leaf:<><path d="M20 3C8 2 3 7 5 14c2 7 14 7 15-11Z"/><path d="M3 21 15 9"/></>,
    user:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>, shop:<><path d="M3 9 5 3h14l2 6M4 10v11h16V10M9 21v-7h6v7"/><path d="M3 9c0 4 6 4 6 0 0 4 6 4 6 0 0 4 6 4 6 0"/></>,
    check:<path d="m5 12 4 4L19 6"/>,close:<path d="m6 6 12 12M6 18 18 6"/>,menu:<path d="M4 7h16M4 12h16M4 17h16"/>,
    logout:<path d="M10 3H4v18h6M9 12h12m-5-5 5 5-5 5"/>,refresh:<><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/></>,
    shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function Brand({home}:{home:()=>void}) {return <a className="brand" href="#" onClick={e=>{e.preventDefault();home();}} aria-label="Gourmet Box — главная"><span className="brand-mark">g.</span><span>gourmet<span className="brand-box">box</span></span></a>;}
const faqs=[
 ['Что такое Gourmet Box?','Сервис боксов с непроданной, но пригодной едой из магазинов, кафе и пекарен. Точка реализует остатки, а покупатель забирает еду по сниженной цене. В каталоге можно выбрать бокс, забронировать время и получить код выдачи.'],
 ['Что окажется внутри бокса?','Состав, количество, аллергены и срок годности будут видны до бронирования. Вам не придётся угадывать. На этой странице показан пример такой карточки.'],
 ['Можно ли заменить продукт?','Опубликованный бокс имеет фиксированный состав. Изменить его в текущей демоверсии нельзя; в карточке примера показан возможный будущий сценарий согласования замены. Перед бронированием проверьте состав и аллергены.'],
 ['Как забирать заказ?','При бронировании выберите время внутри окна, которое задаёт заведение. При получении покажете сотруднику код брони. Доставка в MVP не предусмотрена.'],
 ['Регистрация платная?','Нет, аккаунт бесплатный. Оплата боксов в MVP — заглушка: деньги не списываются и банковские данные не запрашиваются.'],
 ['Как подключить своё заведение?','Создайте аккаунт. Доступ сотрудника и назначение конкретного заведения выдаёт администратор отдельно. Самостоятельно получить доступ к чужой точке нельзя.'],
];
function ExampleComposition(){
 const [stage,setStage]=useState<'initial'|'requested'|'offered'|'agreed'|'payment'>('initial');
 const replacement=stage==='agreed'||stage==='payment';
 return <><h3>Что внутри</h3><ul className="composition"><li><span>Круассан сливочный</span><b>3 шт.</b></li><li><span>{replacement?'Яблоки в отдельной упаковке':'Булочка с корицей'}</span><b>2 шт.</b></li></ul>
 <fieldset className="replacement-options"><legend>Согласование замены · демонстрация</legend>
 <p className="replacement-summary" role="status">{stage==='initial'?'Не подходит позиция? Попросите сотрудника предложить замену.':stage==='requested'?'Запрос на замену булочек ожидает ответа сотрудника. Оплата недоступна.':stage==='offered'?'Сотрудник предложил альтернативу. Проверьте её перед согласием.':stage==='agreed'?'Обе стороны согласовали состав. Можно перейти к оплате.':'Демонстрация перехода к оплате. Деньги не списываются.'}</p>
 {stage==='initial'&&<button className="button dark full" onClick={()=>setStage('requested')}>Запросить замену булочек</button>}
 {stage==='requested'&&<button className="button dark full" onClick={()=>setStage('offered')}>Показать ответ сотрудника (демо)</button>}
 {stage==='offered'&&<><p className="replacement-caution">Пример ответа: вместо 2 булочек — 2 яблока в отдельной упаковке. Состав замены: яблоки. Срок в этом вымышленном примере: до 22:00 дня выдачи. Возможные следы аллергенов не подтверждены. Итоговая цена бокса: 200 ₽.</p><button className="button dark full" onClick={()=>setStage('agreed')}>Согласиться с заменой</button></>}
 <button className="button yellow full" disabled={!replacement||stage==='payment'} onClick={()=>setStage('payment')}>Перейти к оплате (демо)</button>
 {stage!=='initial'&&<button className="text-button" onClick={()=>setStage('initial')}>Отказаться от замены и начать заново</button>}
 </fieldset><div className="allergens" aria-label="Аллергены всего набора"><span>Глютен</span><span>Молоко</span><span>Яйца</span></div><p className="replacement-caution">{replacement?'В круассанах остаются глютен, молоко и яйца. ':''}При аллергии проверьте весь состав и возможные следы аллергенов у точки. Замена сама по себе не гарантирует безопасность.</p></>;
}
function App(){
 const [me,setMe]=useState<Me|null>(null),[name,setName]=useState(''),[busy,setBusy]=useState<string|null>('session'),[error,setError]=useState(callbackError);
 const [page,setPage]=useState('home'),[tab,setTab]=useState('overview'),[menu,setMenu]=useState(false),[modal,setModal]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 const menuTrigger=useRef<HTMLButtonElement>(null);
 const menuClose=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  let live=true;
  const expired=()=>{localStorage.removeItem(SESSION_HINT);setMe(null);setPage('home');setError('Сессия завершена. Войдите снова, чтобы открыть кабинет.');};
  auth.events.addUserUnloaded(expired);auth.events.addSilentRenewError(expired);
  void(async()=>{try{
    const user=await auth.getUser();
    if (!live) return;
    if (!user && localStorage.getItem(SESSION_HINT)==='1' && !callbackError) {
      localStorage.removeItem(SESSION_HINT);
      await auth.signinRedirect({prompt:'none',state:{intent:'restore'}});
      return;
    }
    if(user){const result=await getMe();if(live){localStorage.setItem(SESSION_HINT,'1');setMe(result);setPage(postAuthPage);setName(String(user.profile.given_name||user.profile.preferred_username||'Друг'));}}
  }catch(e){if(live)setError(e instanceof Error?e.message:'Не удалось проверить доступ.');}finally{if(live)setBusy(null);}})();
  return()=>{live=false;auth.events.removeUserUnloaded(expired);auth.events.removeSilentRenewError(expired);};
 },[]);
 useEffect(()=>{if(modal)dialog.current?.showModal();else dialog.current?.close();},[modal]);
 useEffect(()=>{
  if(!menu) return;
  const previousOverflow=document.body.style.overflow;
  const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setMenu(false);};
  document.body.style.overflow='hidden';
  menuClose.current?.focus();
  window.addEventListener('keydown',closeOnEscape);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',closeOnEscape);menuTrigger.current?.focus();};
 },[menu]);
 async function enter(register=false){setBusy(register?'register':'login');setError('');setMenu(false);try{await signIn(register);}catch{setError('Сервис входа сейчас недоступен. Попробуйте ещё раз чуть позже.');setBusy(null);}}
 async function refresh(){setBusy('refresh');setError('');try{setMe(await getMe());}catch(e){setError(e instanceof Error?e.message:'Не удалось обновить доступ.');}finally{setBusy(null);}}
 async function logout(){setBusy('logout');setError('');localStorage.removeItem(SESSION_HINT);try{await auth.signoutRedirect();}catch{setError('Не удалось завершить выход. Попробуйте ещё раз.');setBusy(null);}}
 function home(anchor=''){setPage('home');setMenu(false);requestAnimationFrame(()=>anchor?document.getElementById(anchor)?.scrollIntoView({behavior:'smooth'}):window.scrollTo({top:0,behavior:'smooth'}));}
 function account(next='overview'){setPage('account');setTab(next);setMenu(false);window.scrollTo({top:0});}
 const staff=me?.roles.includes('STAFF');
 const start=()=>me?account():void enter(true);
 return <>
  <a className="skip-link" href="#main">К содержимому</a>
  <header className={'site-header ' + 'home-header'}><div className="header-inner"><Brand home={()=>home()}/><nav className="desktop-nav" aria-label="Основная навигация"><button onClick={()=>home('catalog')}>Каталог</button><button onClick={()=>home('how')}>Как это работает</button><button onClick={()=>home('business')}>Для заведений</button><button onClick={()=>home('faq')}>Вопросы</button></nav><div className="header-actions">{me?<button className="account-button" onClick={()=>account()}><span className="avatar small">{name.slice(0,1).toUpperCase()}</span><span>Мой кабинет</span></button>:<><button className="text-button" disabled={!!busy} onClick={()=>void enter()}>Войти</button><button className="button dark header-signup" disabled={!!busy} onClick={()=>void enter(true)}>Создать аккаунт<Icon name="arrow" size={17}/></button></>}<button ref={menuTrigger} className="icon-button mobile-toggle" aria-label={menu?'Закрыть меню':'Открыть меню'} aria-expanded={menu} aria-controls="mobile-menu" onClick={()=>setMenu(!menu)}><Icon name={menu?'close':'menu'}/></button></div></div></header>
  <div className={'menu-overlay ' + (menu ? 'is-open' : '')} aria-hidden={!menu} inert={!menu}><button className="menu-backdrop" tabIndex={-1} aria-label="Закрыть меню" onClick={()=>setMenu(false)}/><nav id="mobile-menu" className="mobile-menu" aria-label="Меню"><div className="menu-heading"><span>НАВИГАЦИЯ / GOURMET BOX</span><button ref={menuClose} className="icon-button" aria-label="Закрыть меню" onClick={()=>setMenu(false)}><Icon name="close"/></button></div><div className="menu-links"><button onClick={()=>home('catalog')}><span>01</span>Каталог<Icon name="arrow"/></button><button onClick={()=>home('how')}><span>02</span>Как это работает<Icon name="arrow"/></button><button onClick={()=>home('business')}><span>03</span>Для заведений<Icon name="arrow"/></button><button onClick={()=>home('faq')}><span>04</span>Вопросы<Icon name="arrow"/></button></div><div className="menu-bottom"><span>ХОРОШЕЙ ЕДЕ — ВТОРОЙ ШАНС</span>{!me&&<button className="button yellow" disabled={!!busy} onClick={()=>void enter(true)}>Создать аккаунт<Icon name="arrow"/></button>}</div></nav></div>
  <main id="main" className={page === 'home' ? 'home-page' : 'account-page'}>
  {error&&<div className="alert" role="alert"><div><strong>Что-то пошло не так</strong><p>{error}</p></div><button className="icon-button" aria-label="Закрыть сообщение" onClick={()=>setError('')}><Icon name="close"/></button></div>}
  {busy&&<div className="busy-line" role="status"><span className="spinner"/>{busy==='session'?'Проверяем ваш аккаунт…':busy==='refresh'?'Обновляем доступ…':busy==='logout'?'Выходим из аккаунта…':'Открываем защищённую страницу…'}</div>}
  {page==='account'&&me?<div className="container account-layout"><div className="account-heading"><div><p className="eyebrow">ВАШ GOURMET BOX</p><h1>Привет, {name.split('@')[0]}<span className="yellow-dot">.</span></h1><p className="muted">Хорошо, что вы с нами. Всё важное — здесь.</p></div><span className="status-pill"><i/>Вы вошли</span></div><nav className="account-tabs" aria-label="Разделы кабинета">{[['overview','Обзор','user'],['catalog','Каталог','bag'],['bookings','Мои брони','clock'],...(staff?[['venues','Мои заведения','shop']]:[])].map(([key,label,icon])=><button key={key} className={tab===key?'active':''} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}><Icon name={icon as IconName} size={19}/>{label}</button>)}</nav><div className={"account-grid "+(tab==="overview"?"":"account-grid-wide")}><section>
   {tab==='overview'&&<><div className="welcome-panel"><span className="panel-icon"><Icon name="check" size={27}/></span><h2>Аккаунт готов.<br/>Впереди много вкусного.</h2><p>Вы {staff?'можете работать с назначенными заведениями':'зарегистрированы как покупатель'}. В каталоге уже можно искать боксы и бронировать время получения.</p><button className="button dark" onClick={()=>home('how')}>Познакомиться с сервисом<Icon name="arrow" size={18}/></button><span className="welcome-doodle" aria-hidden="true">✳</span></div><div className="shortcuts"><button onClick={()=>setTab('bookings')}><Icon name="bag"/><strong>Мои брони</strong><span>Будущие и завершённые</span><Icon name="arrow" size={18}/></button><button onClick={()=>staff?setTab('venues'):home('business')}><Icon name="shop"/><strong>{staff?'Мои заведения':'Для заведений'}</strong><span>{staff?'Назначены администратором':'Работа с боксами'}</span><Icon name="arrow" size={18}/></button></div></>}
   {tab==='catalog'&&<Catalog canBook={me.roles.includes('BUYER')} onLogin={()=>void enter()} onBooked={()=>account('bookings')}/>}{tab==='bookings'&&<MyBookings onCatalog={()=>setTab('catalog')}/>}
   {tab==='venues'&&staff&&<section className="venues-panel"><p className="eyebrow">КАБИНЕТ СОТРУДНИКА</p><h2>Ваши заведения</h2><p className="muted">Только точки, к которым вам назначили доступ.</p>{me.venues.length?me.venues.map(v=><article className="venue-row" key={v.id}><span className="panel-icon"><Icon name="shop"/></span><div><h3>{v.name}</h3><p>Доступ сотрудника активен</p></div><span className="status-pill"><i/>Подключено</span></article>):<p className="inline-empty">Пока нет назначенных заведений. Обратитесь к администратору для подключения вашей точки.</p>}<StaffBookings venues={me.venues}/></section>}
   </section><aside className="profile-card"><div className="profile-top"><span className="avatar">{name.slice(0,1).toUpperCase()}</span><span className="pill neutral">{staff?'Сотрудник':'Покупатель'}</span></div><h3>{name}</h3><p>Личный аккаунт Gourmet Box</p><div className="profile-security"><Icon name="shield"/><span>Защищённый вход<br/><small>Пароль хранится в сервисе авторизации</small></span></div><button className="profile-action" disabled={!!busy} onClick={()=>void refresh()}><Icon name="refresh" size={18}/>Обновить доступ</button><button className="profile-action logout" disabled={!!busy} onClick={()=>void logout()}><Icon name="logout" size={18}/>Выйти из аккаунта</button></aside></div></div>:<>
   <section className="hero-cinematic"><div className="hero-noise" aria-hidden="true"/><div className="hero-orbit hero-orbit-one" aria-hidden="true"/><div className="hero-orbit hero-orbit-two" aria-hidden="true"/><div className="hero-inner container"><div className="hero-copy"><span className="hero-kicker"><i className="live-dot"/>GOURMET BOX / ЕДА С ПРОДОЛЖЕНИЕМ</span><h1>ХОРОШАЯ ЕДА.<br/><em>НОВЫЙ</em><br/>ПОВОД.</h1><p className="hero-description">Боксы с любимой едой из кафе, пекарен и магазинов. Вы знаете состав и цену заранее, а забираете заказ по пути.</p><div className="hero-actions"><button className="button yellow" disabled={!!busy} onClick={start}>{me?'В личный кабинет':'Создать аккаунт'}<Icon name="arrow"/></button><a className="underlined" href="#how">Как это работает<Icon name="arrow" size={17}/></a></div><div className="hero-note"><Icon name="check" size={16}/>Регистрация бесплатная<span>Выбирайте и бронируйте боксы</span></div></div><div className="hero-product"><div className="product-halo" aria-hidden="true"/><span className="product-vertical">FRESH FINDS / SECOND CHANCE</span><React.Suspense fallback={<div className="bakery-scene"><img src="/images/bakery-hero-photo.png" alt="Крафтовый бокс с выпечкой" /></div>}><BakeryScene/></React.Suspense></div><div className="hero-detail"><span className="detail-top">01 / ПРИМЕР БОКСА</span><h2>Последний<br/>круассан?<br/><em>Самое время.</em></h2><p>Вечерняя выпечка — пример того, как будет выглядеть бокс с известным составом и выгодной ценой.</p><button className="hero-example" onClick={()=>setModal(true)} aria-label="Посмотреть состав примера бокса Вечерняя выпечка"><span className="example-label">ВЕЧЕРНЯЯ ВЫПЕЧКА <Icon name="arrow" size={17}/></span><span className="example-main"><span><strong>3 круассана + 2 булочки</strong><small>Забрать: 20:30–21:30</small></span><span className="example-price">200 ₽<del>500 ₽</del></span></span><span className="example-bottom"><span>Пример, не доступен для заказа</span><span>Что внутри <Icon name="arrow" size={16}/></span></span></button></div></div><div className="hero-bottom container"><span>ВКУСНОЕ НЕ ДОЛЖНО ПРОПАДАТЬ</span><a href="#how" aria-label="Прокрутить к разделу как это работает">ЛИСТАЙТЕ ВНИЗ ↓</a><span>GOURMET BOX © 2026</span></div></section>
   <div className="benefits-strip"><div className="container benefits-inner"><span><Icon name="bag"/>Состав известен заранее</span><span><Icon name="clock"/>Забираете, когда удобно</span><span><Icon name="leaf"/>Меньше пищевых отходов</span></div></div>
   <div id="catalog" className="container catalog-wrap"><Catalog canBook={!!me?.roles.includes('BUYER')} onLogin={()=>void enter()} onBooked={()=>account('bookings')}/></div>
   <section id="how" className="container how-section"><div className="section-heading"><div><p className="eyebrow">НИЧЕГО ЛИШНЕГО</p><h2>Три шага.<br/>Один хороший вечер.</h2></div><p>Выберите бокс, время получения<br/>и покажите код сотруднику.</p></div><div className="steps-grid">{[['01','bag','Найдите свой бокс','Состав, аллергены и срок годности — всё в карточке до бронирования.'],['02','clock','Выберите время','Укажите, когда сможете забрать заказ, внутри окна заведения.'],['03','check','Заберите и наслаждайтесь','Покажите код сотруднику. Хорошая еда обретёт новый дом.']].map(([n,icon,title,description])=><article className="step" key={n}><div className="step-top"><span>{n}</span><Icon name={icon as IconName} size={27}/></div><h3>{title}</h3><p>{description}</p></article>)}</div></section>
   <section id="business" className="container business-wrap"><div className="business-panel"><div><p className="eyebrow">ВЫ НА СТОРОНЕ ВКУСНОГО?</p><h2>Последний круассан —<br/>тоже возможность.</h2><p>Магазин, пекарня или кафе? Опубликуйте пригодную непроданную еду с понятным составом, аллергенами и сроком годности. Покупатели смогут забронировать бокс, а сотрудник — выдать его по коду.</p><button className="button yellow" disabled={!!busy} onClick={()=>me?account(staff?'venues':'overview'):void enter(true)}>{me&&staff?'Мои заведения':'Начать с аккаунта'}<Icon name="arrow" size={19}/></button><small>Доступ заведения подключает администратор.</small></div><div className="business-art" aria-hidden="true"><div className="paper-receipt"><span className="receipt-brand">gourmet box</span><span>ХОРОШИЙ ИТОГ ДНЯ</span><hr/><div><span>Пригодная еда</span><b>✓</b></div><div><span>Новый покупатель</span><b>✓</b></div><div><span>Меньше остатков</span><b>✓</b></div><hr/><strong>ВКУСНО ВДВОЙНЕ.</strong><span className="receipt-barcode">|||| ||| |||||| | ||| ||||</span></div><span className="business-star">✳</span></div></div></section>
   <section id="faq" className="container faq-section"><div><p className="eyebrow">ДАВАЙТЕ РАЗБЕРЁМСЯ</p><h2>Вопросы?<br/>Есть ответы.</h2><p className="muted">Всё, что важно перед знакомством.</p></div><div className="faq-list">{faqs.map(([question,answer])=><details key={question}><summary>{question}<span>+</span></summary><p>{answer}</p></details>)}</div></section>
   <section className="final-cta"><Icon name="leaf" size={30}/><h2>Хорошее начинается<br/>с маленького бокса.</h2><button className="button dark" disabled={!!busy} onClick={start}>{me?'Открыть мой кабинет':'Создать аккаунт'}<Icon name="arrow"/></button><p>Бесплатно. Без подписки и банковской карты.</p></section>
  </>}
  </main><footer className={'site-footer container ' + 'home-footer'}><Brand home={()=>home()}/><p>Хорошая еда заслуживает второго шанса.</p><span>Gourmet Box · MVP 1.0</span></footer>
  <nav className={'bottom-nav ' + 'home-bottom-nav'} aria-label="Мобильная навигация"><button className={page==='home'?'active':''} onClick={()=>home()}><Icon name="leaf" size={21}/><span>Главная</span></button><button onClick={()=>home('catalog')}><Icon name="bag" size={21}/><span>Каталог</span></button><button className={page==='account'?'active':''} disabled={!!busy} onClick={()=>me?account():void enter()}><Icon name="user" size={21}/><span>{me?'Мой кабинет':'Войти'}</span></button></nav>
  <dialog ref={dialog} aria-labelledby="example-title" className="box-dialog" onCancel={()=>setModal(false)} onClick={e=>{if(e.target===e.currentTarget)setModal(false);}}><button className="icon-button dialog-close" aria-label="Закрыть карточку бокса" onClick={()=>setModal(false)}><Icon name="close"/></button><div className="dialog-photo"><img src="/images/bakery-hero-photo.png" alt="Пример бокса с выпечкой"/></div><div className="dialog-body"><span className="pill neutral">Иллюстративный пример</span><h2 id="example-title">Вечерняя выпечка</h2><p className="muted">Так будет выглядеть карточка бокса.</p><div className="dialog-price">200 ₽<del>500 ₽</del><span>−60%</span></div><ExampleComposition/><div className="pickup-note"><Icon name="clock"/><span>Пример окна получения<strong>20:30–21:30</strong></span></div><p className="dialog-disclaimer">Это пример, а не предложение продажи. Реальные боксы появятся после запуска каталога.</p><button className="button dark full" disabled={!!busy} onClick={()=>{setModal(false);start();}}>{me?'Перейти в кабинет':'Создать аккаунт'}<Icon name="arrow"/></button></div></dialog>
 </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
