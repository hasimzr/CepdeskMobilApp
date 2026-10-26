import React from 'react';
import { View } from 'react-native';
// Code-native icons remain sharp at every panel size and require no font or network.
export function LinuxIcon({ size = 24 }: { size?: number }) {
  return <View pointerEvents="none" accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 32, height: 32, transform: [{ scale: size / 32 }] }}>
    <View style={{ position: 'absolute', left: 6, top: 1, width: 20, height: 29, borderRadius: 12, backgroundColor: '#151820', borderWidth: 1, borderColor: '#687080' }} />
    <View style={{ position: 'absolute', left: 2, top: 12, width: 8, height: 16, borderRadius: 6, backgroundColor: '#151820', transform: [{ rotate: '20deg' }] }} />
    <View style={{ position: 'absolute', right: 2, top: 12, width: 8, height: 16, borderRadius: 6, backgroundColor: '#151820', transform: [{ rotate: '-20deg' }] }} />
    <View style={{ position: 'absolute', left: 9, top: 12, width: 14, height: 16, borderRadius: 9, backgroundColor: '#f7f7f2' }} />
    <View style={{ position: 'absolute', left: 10, top: 5, width: 5, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />
    <View style={{ position: 'absolute', left: 17, top: 5, width: 5, height: 7, borderRadius: 4, backgroundColor: '#fff' }} />
    <View style={{ position: 'absolute', left: 12, top: 7, width: 2, height: 3, borderRadius: 2, backgroundColor: '#171820' }} />
    <View style={{ position: 'absolute', left: 18, top: 7, width: 2, height: 3, borderRadius: 2, backgroundColor: '#171820' }} />
    <View style={{ position: 'absolute', left: 11, top: 11, width: 10, height: 5, borderRadius: 3, backgroundColor: '#f5b83c' }} />
    <View style={{ position: 'absolute', left: 4, bottom: 0, width: 12, height: 6, borderRadius: 4, backgroundColor: '#f5b83c', transform: [{ rotate: '-12deg' }] }} />
    <View style={{ position: 'absolute', right: 4, bottom: 0, width: 12, height: 6, borderRadius: 4, backgroundColor: '#f5b83c', transform: [{ rotate: '12deg' }] }} />
  </View></View>;
}
export function MouseIcon({ button, color, highlight, size = 26 }: { button: 'left' | 'middle' | 'right'; color: string; highlight: string; size?: number }) {
  return <View pointerEvents="none" accessible={false} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 22, height: 28, borderWidth: 1.5, borderColor: color, borderRadius: 10, overflow: 'hidden', transform: [{ scale: size / 28 }] }}>
    <View style={{ position: 'absolute', left: 0, top: 0, width: 9.5, height: 12, backgroundColor: button === 'left' ? highlight : 'transparent', borderRightWidth: 1, borderBottomWidth: 1, borderColor: color }} />
    <View style={{ position: 'absolute', right: 0, top: 0, width: 9.5, height: 12, backgroundColor: button === 'right' ? highlight : 'transparent', borderBottomWidth: 1, borderColor: color }} />
    <View style={{ position: 'absolute', left: 7.5, top: 3, width: 4, height: 7, borderRadius: 3, borderWidth: 1, borderColor: color, backgroundColor: button === 'middle' ? highlight : color }} />
  </View></View>;
}
