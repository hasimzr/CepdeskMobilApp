export type Key = { code: number; label: string; shifted?: string; width?: number };
export const k = (code: number, label: string, shifted?: string, width = 1): Key => ({ code, label, shifted, width });
export const rows: Key[][] = [
  [k(1,'Esc'), ...Array.from({length:10}, (_,i) => k(59+i,`F${i+1}`)), k(87,'F11'), k(88,'F12'), k(99,'PrtSc'), k(70,'ScrLk'), k(119,'Pause')],
  [k(41,'`','~'), ...Array.from({length:10}, (_,i) => k(2+i,String((i+1)%10),'!@#$%^&*()'[i])), k(12,'-','_'), k(13,'=','+'), k(14,'⌫',undefined,2)],
  [k(15,'Tab',undefined,1.5), ...'QWERTYUIOP'.split('').map((l,i) => k(16+i,l)), k(26,'[','{'), k(27,']','}'), k(43,'\\','|',1.5)],
  [k(58,'Caps',undefined,1.8), ...'ASDFGHJKL'.split('').map((l,i) => k(30+i,l)), k(39,';',':'), k(40,"'",'"'), k(28,'Enter',undefined,2.2)],
  [k(42,'Shift',undefined,2.2), ...'ZXCVBNM'.split('').map((l,i) => k(44+i,l)), k(51,',','<'), k(52,'.','>'), k(53,'/','?'), k(54,'Shift',undefined,2.8)],
  [k(29,'Ctrl',undefined,1.5), k(125,'Super',undefined,1.5), k(56,'Alt',undefined,1.5), k(57,'Space',undefined,5), k(100,'AltGr',undefined,1.5), k(126,'Super',undefined,1.5), k(127,'Menu'), k(97,'Ctrl',undefined,1.5)],
  [k(110,'Ins'),k(111,'Del'),k(102,'Home'),k(107,'End'),k(104,'PgUp'),k(109,'PgDn'),k(105,'←'),k(103,'↑'),k(108,'↓'),k(106,'→'),k(69,'Num'),k(98,'÷'),k(55,'×'),k(74,'−'),k(78,'+')],
  [k(71,'7'),k(72,'8'),k(73,'9'),k(75,'4'),k(76,'5'),k(77,'6'),k(79,'1'),k(80,'2'),k(81,'3'),k(82,'0'),k(83,'.'),k(96,'Num ↵',undefined,2),k(86,'<','>'),k(113,'Mute'),k(114,'Vol−'),k(115,'Vol+')],
];
