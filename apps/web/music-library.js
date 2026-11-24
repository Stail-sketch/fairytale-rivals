import { leaders } from '../../packages/cards/index.js'
import { escapeText } from './card-terms.js'
import { bgmFiles } from './scene-music.js'

export const musicTracks = [
  {id:'menu', title:'物語の扉', subtitle:'メニュー', art:'battle-hall'},
  {id:'deck', title:'綴られる戦略', subtitle:'デッキ編集・カードライブラリ', art:'battle-hall'},
  {id:'arena', title:'運命の三つの扉', subtitle:'闘技場・ピック', art:'battle-hall'},
  ...Object.entries(leaders).map(([id,leader])=>({id,title:leader.name,subtitle:leader.job+'のテーマ',art:id})),
]

export function createMusicLibrary({art, volume, setVolume, onOpen, onClose}) {
  const dialog=document.createElement('dialog')
  dialog.className='music-library';dialog.setAttribute('aria-labelledby','music-library-title')
  dialog.innerHTML=`<header class="music-library-heading"><div><small>FAIRYTALE SOUND COLLECTION</small><h1 id="music-library-title">物語の音楽室</h1><p>全10曲。好きな物語を、好きなだけ。</p></div><button class="secondary" data-music-close aria-label="音楽ライブラリを閉じる">閉じる ×</button></header>
    <div class="music-library-layout"><section class="music-now"><div class="music-cover"><img alt=""><span class="music-disc" aria-hidden="true">♪</span></div><small class="music-now-category"></small><h2></h2><audio controls preload="metadata" aria-label="選択した楽曲の再生・一時停止・再生位置・音量"></audio><div class="music-transport"><button class="secondary" data-music-prev aria-label="前の曲">‹ 前の曲</button><button class="secondary" data-music-next aria-label="次の曲">次の曲 ›</button></div><label class="music-repeat"><input type="checkbox" data-music-loop checked> この曲をリピート</label><p class="music-status" role="status">曲を選ぶと再生します。</p></section>
    <section class="music-tracklist" aria-label="収録曲">${musicTracks.map((track,index)=>`<button data-music-track="${track.id}" aria-pressed="false"><span class="music-track-number">${String(index+1).padStart(2,'0')}</span><img src="${art(track.art)}" alt="" loading="lazy"><span><strong>${escapeText(track.title)}</strong><small>${escapeText(track.subtitle)}</small></span><span class="music-track-indicator" aria-hidden="true">▶</span></button>`).join('')}</section></div>`
  document.body.append(dialog)
  const audio=dialog.querySelector('audio'),status=dialog.querySelector('.music-status')
  let index=0,request=0,focusBack=null
  audio.loop=true
  function updatePlaying() {
    const playing=!audio.paused&&!audio.ended
    dialog.classList.toggle('is-playing',playing)
    for(const row of dialog.querySelectorAll('[data-music-track]')) {
      const selected=row.dataset.musicTrack===musicTracks[index].id
      row.setAttribute('aria-pressed',String(selected))
      row.querySelector('.music-track-indicator').textContent=selected&&playing?'♫':'▶'
    }
  }
  function select(next,play=true) {
    index=(next+musicTracks.length)%musicTracks.length
    const track=musicTracks[index],file=bgmFiles[track.id],ticket=++request
    dialog.querySelector('.music-cover img').src=art(track.art)
    dialog.querySelector('.music-now h2').textContent=track.title
    dialog.querySelector('.music-now-category').textContent=track.subtitle
    audio.src=globalThis.fairytaleMusic?.[file]??new URL('./assets/'+file,import.meta.url).href
    status.textContent=play?'読み込み中…':'再生ボタンで試聴できます。'
    updatePlaying()
    if(play) audio.play().catch(()=>{if(ticket===request&&dialog.open)status.textContent='再生ボタンを押して試聴してください。'})
  }
  for(const event of ['playing','pause','ended'])audio.addEventListener(event,()=>{updatePlaying();if(dialog.open)status.textContent=event==='playing'?'再生中':event==='ended'?'再生が終了しました':'一時停止中'})
  audio.addEventListener('ended',()=>{if(!audio.loop&&dialog.open)select(index+1)})
  audio.addEventListener('error',()=>{if(dialog.open)status.textContent='音源を読み込めませんでした。曲を選び直してください。'})
  audio.addEventListener('volumechange',()=>{if(dialog.open)setVolume(Math.round(audio.volume*100))})
  dialog.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return
    if(button.hasAttribute('data-music-close'))dialog.close()
    if(button.dataset.musicTrack)select(musicTracks.findIndex(track=>track.id===button.dataset.musicTrack))
    if(button.hasAttribute('data-music-prev'))select(index-1)
    if(button.hasAttribute('data-music-next'))select(index+1)
  })
  dialog.querySelector('[data-music-loop]').addEventListener('change',event=>audio.loop=event.target.checked)
  dialog.addEventListener('close',()=>{++request;audio.pause();audio.removeAttribute('src');audio.load();dialog.classList.remove('is-playing');onClose();if(focusBack?.isConnected)focusBack.focus()})
  return {
    get isOpen(){return dialog.open},
    open(){if(dialog.open)return;focusBack=document.activeElement;dialog.showModal();onOpen();audio.volume=volume()/100;select(index,false);dialog.querySelector('[data-music-close]').focus()},
  }
}
