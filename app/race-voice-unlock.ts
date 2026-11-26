export type RaceAudioMode='both'|'voice'|'ambient';

export function unlockRaceVoice(){
 if(typeof window==='undefined'||!('speechSynthesis' in window)||!('SpeechSynthesisUtterance' in window))return;
 try{
  const synth=window.speechSynthesis;
  synth.getVoices();
  synth.resume();
  const utterance=new SpeechSynthesisUtterance(' ');
  utterance.lang='ja-JP';utterance.volume=0;
  synth.speak(utterance);
 }catch{/* Audio availability depends on the browser and installed voices. */}
}

let preparedContext: AudioContext|undefined;

export function raceAudioContext(){
 if(preparedContext){const context=preparedContext;preparedContext=undefined;return context;}
 const Audio=window.AudioContext??(window as Window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
 return Audio?new Audio():undefined;
}

export function prepareRaceAudio(mode:RaceAudioMode,enabled:boolean){
 if(mode!=='ambient')unlockRaceVoice();
 if(!enabled||mode==='voice')return;
 try{
  if(!preparedContext)preparedContext=raceAudioContext();
  void preparedContext?.resume().catch(()=>{});
 }catch{}
}
