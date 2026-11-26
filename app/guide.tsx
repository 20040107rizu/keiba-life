'use client';

export const phases = ['調教', '登録', '馬券', '観戦', '翌週'];
export const ticketHelp = [
 '1着になる馬を1頭選びます。',
 '3着以内に入る馬を1頭選びます（7頭以下では2着以内）。',
 '1着・2着の馬が入る枠番号を、順不同で選びます。',
 '1着・2着になる2頭を、順不同で選びます。',
 '3着以内に入る2頭を、順不同で選びます。',
 '1着・2着になる馬を、着順どおりに選びます。',
 '3着以内に入る3頭を、順不同で選びます。',
 '1着・2着・3着になる馬を、着順どおりに選びます。',
];

export function AdvisorPortrait() {
 // eslint-disable-next-line @next/next/no-img-element
 return <img className="advisor-portrait" src="/trainer.webp" width={56} height={56} alt="調教師アドバイザー"/>;
}
