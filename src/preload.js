'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cuadrito', {
  beginGesture: (gesture) => ipcRenderer.send('gesture:begin', gesture),
  endGesture: () => ipcRenderer.send('gesture:end'),
  openMenu: () => ipcRenderer.send('menu:open'),
  cycleGlass: () => ipcRenderer.send('glass:cycle'),
  refresh: () => ipcRenderer.send('usage:refresh'),
  signIn: () => ipcRenderer.send('auth:signin'),
  ready: () => ipcRenderer.send('ui:ready'),
  onUpdate: (listener) => ipcRenderer.on('ui:update', (_event, update) => listener(update)),
  onClosing: (listener) => ipcRenderer.on('ui:closing', () => listener()),
  onWalk: (listener) => ipcRenderer.on('ui:walk', (_event, walk) => listener(walk)),
});
