import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata:Metadata = {title:'競馬ライフ | KEIBA LIFE',description:'育成から馬券まで楽しめる、ひとり用の競馬ゲーム。', manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'競馬ライフ',statusBarStyle:'default'},icons:{icon:'/icon-192.png',apple:'/icon-192.png'}};
export const viewport:Viewport = {themeColor:'#0c2d25',viewportFit:'cover'};
export default function Layout({children}:{children:React.ReactNode}){
 return <html lang="ja"><body>{children}</body></html>;
}
