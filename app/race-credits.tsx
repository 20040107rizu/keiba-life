export function ModelCredits(){
 return <section className="card">
  <h1>クレジット</h1>
  <h2>競走馬の3Dモデルとギャロップ</h2>
  <p>Horse.glb — Mirada / ROME「3 Dreams of Black」</p>
  <p>Creative Commons 表示・非営利・継承 3.0 非移植（CC BY-NC-SA 3.0）</p>
  <p>競馬ライフでの変更は毛色と法線、縮尺、低速時のアニメーション調整です。</p>
  <p><a href="https://threejs.org/examples/webgl_morphtargets_horse.html">three.js の配布例</a> · <a href="https://rome.mrdoob.com/">ROME 原作品</a> · <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/">ライセンス</a></p>
  <h2>競馬場と映像</h2>
  <p>芝・ダート・馬番布・影・大型ビジョンのテクスチャは競馬ライフ用にコードで生成。発走前の動画は依頼者提供素材です。</p>
  <h2>レース音声</h2>
  <p>実況は端末の Web Speech API。歓声とひづめは競馬ライフ用に Web Audio API で生成し、外部録音素材を使用していません。</p>
 </section>;
}
