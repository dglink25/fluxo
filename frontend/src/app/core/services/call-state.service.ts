import { Injectable, signal } from '@angular/core';

export interface ActiveCall {
  callId: string;
  roomId: string;
  title: string;
  hostName: string;
  callUrl: string;
  /** true = modal flottant réduit, false = vue plein écran */
  minimized: boolean;
}

/**
 * Service singleton partagé entre CallComponent et AppComponent.
 * Maintient l'état de l'appel actif pour le modal flottant Picture-in-Picture.
 */
@Injectable({ providedIn: 'root' })
export class CallStateService {
  /** Appel actif (null = pas d'appel en cours) */
  readonly activeCall = signal<ActiveCall | null>(null);

  /** Référence à la PeerConnection active — partagée avec AppComponent pour le modal */
  remoteStream = signal<MediaStream | null>(null);
  localStream = signal<MediaStream | null>(null);

  setActive(call: ActiveCall) {
    this.activeCall.set(call);
  }

  minimize() {
    const c = this.activeCall();
    if (c) this.activeCall.set({ ...c, minimized: true });
  }

  maximize() {
    const c = this.activeCall();
    if (c) this.activeCall.set({ ...c, minimized: false });
  }

  clear() {
    this.activeCall.set(null);
    this.remoteStream.set(null);
    this.localStream.set(null);
  }
}
