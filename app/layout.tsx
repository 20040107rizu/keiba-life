import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata:Metadata = {title:'競馬ライフ | KEIBA LIFE',description:'育成から馬券まで楽しめる、ひとり用の競馬ゲーム。', manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'青葉ステーブル'}};
export const viewport:Viewport = {themeColor:'#1F6B3A',viewportFit:'cover'};
export default function Layout({children}:{children:React.ReactNode}){
 return <html lang="ja"><body>{children}</body></html>;
}
