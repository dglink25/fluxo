import {
  Component, OnInit, OnDestroy, signal, computed,
  ElementRef, ViewChild, AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessagingService, ProjectChannelGroup } from '../../core/services/messaging.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { AuthService } from '../../core/services/auth.service';
import { Channel, ChatMessage, DirectMessageConversation } from '../../core/models/message.model';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { debounceTime, Subject, takeUntil } from 'rxjs';

type ActivePane = 'channels' | 'dm';

@Component({
  selector: 'flx-messaging',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent, BottomNavComponent, IconComponent],
  templateUrl: './messaging.component.html',
  styleUrl: './messaging.component.scss',
})
export class MessagingComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') messageListRef!: ElementRef<HTMLDivElement>;
  @ViewChild('fileInput')   fileInputRef!:  ElementRef<HTMLInputElement>;

  activePane = signal<ActivePane>('channels');

  // ── Channels (tous projets) ──────────────────────────────────────────────
  projectGroups    = signal<ProjectChannelGroup[]>([]);
  activeChannelId  = signal<string | null>(null);
  activeProjectId  = signal<string | null>(null);
  channelMessages  = signal<ChatMessage[]>([]);

  // ── DM ───────────────────────────────────────────────────────────────────
  conversations = signal<DirectMessageConversation[]>([]);
  activeDmId    = signal<string | null>(null);
  dmMessages    = signal<ChatMessage[]>([]);

  loadingMessages  = signal(false);
  loadingChannels  = signal(false);
  newMessage = '';
  sending    = signal(false);

  // ── Modal nouveau channel ────────────────────────────────────────────────
  showNewChannelModal = signal(false);
  newChannelProject   = signal<ProjectChannelGroup | null>(null);
  newChannelName      = '';
  creatingChannel     = signal(false);

  // ── Modal nouvelle DM ────────────────────────────────────────────────────
  showNewDmModal  = signal(false);
  dmSearchQuery   = '';
  dmSearchResults = signal<any[]>([]);
  creatingDm      = signal(false);
  private dmSearch$ = new Subject<string>();

  // ── Fichier attaché ──────────────────────────────────────────────────────
  attachedFile:    File | null = null;
  attachedPreview: string | null = null;
  attachedType = signal<'image' | 'video' | 'audio' | 'file' | null>(null);

  // ── Enregistrement vocal ─────────────────────────────────────────────────
  isRecording      = signal(false);
  recordingSeconds = signal(0);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer?: ReturnType<typeof setInterval>;

  // ── Recherche messages ───────────────────────────────────────────────────
  searchQuery   = '';
  searchResults = signal<ChatMessage[]>([]);
  showSearch    = signal(false);

  private searchSubject = new Subject<string>();
  private destroy$      = new Subject<void>();
  private shouldScrollToBottom = false;

  activeMessages = computed(() =>
    this.activePane() === 'channels' ? this.channelMessages() : this.dmMessages(),
  );

  activeChannelName = computed(() => {
    for (const g of this.projectGroups()) {
      const ch = g.channels.find((c) => c.id === this.activeChannelId());
      if (ch) return { project: g.projectName, channel: ch.name };
    }
    return null;
  });

  constructor(
    private route: ActivatedRoute,
    private messaging: MessagingService,
    public auth: AuthService,
    private realtime: RealtimeService,
  ) {}

  ngOnInit() {
    this.loadAllChannels();
    this.loadDms();
    this.setupRealtimeHandlers();
    this.setupSearchHandlers();

    // Si on arrive depuis un projet spécifique
    this.route.queryParamMap.subscribe((params) => {
      const pid = params.get('projectId');
      if (pid) {
        this.activePane.set('channels');
        // Sélectionner le premier channel de ce projet une fois chargé
        this.projectGroups$.subscribe((groups) => {
          const group = groups.find((g) => g.projectId === pid);
          if (group?.channels.length) this.selectChannel(group.channels[0], group.projectId);
        });
      }
    });
  }

  // petit helper pour observer le signal une fois
  private get projectGroups$() {
    return new Subject<ProjectChannelGroup[]>();
  }

  loadAllChannels() {
    this.loadingChannels.set(true);
    this.messaging.listAllChannels().subscribe({
      next: (groups) => {
        this.projectGroups.set(groups);
        this.loadingChannels.set(false);

        // Sélectionner le premier channel si aucun actif
        const pid = this.route.snapshot.queryParamMap.get('projectId');
        if (pid) {
          const g = groups.find((x) => x.projectId === pid);
          if (g?.channels.length) {
            this.selectChannel(g.channels[0], g.projectId);
            return;
          }
        }
        // Sinon premier channel disponible
        if (!this.activeChannelId() && groups.length > 0 && groups[0].channels.length > 0) {
          this.selectChannel(groups[0].channels[0], groups[0].projectId);
        }
      },
      error: () => this.loadingChannels.set(false),
    });
  }

  loadDms() {
    this.messaging.listDms().subscribe({
      next: (convs) => {
        this.conversations.set(convs);
        if (!this.activeDmId() && convs.length > 0 && this.activePane() === 'dm') {
          this.selectDm(convs[0]);
        }
      },
      error: () => {},
    });
  }

  private setupRealtimeHandlers() {
    this.realtime.on<ChatMessage>('message:new', (msg) => {
      if (msg.channelId === this.activeChannelId()) {
        if (!this.channelMessages().find((m) => m.id === msg.id)) {
          this.channelMessages.update((l) => [...l, msg]);
        }
        this.shouldScrollToBottom = true;
      } else if (msg.dmId === this.activeDmId()) {
        if (!this.dmMessages().find((m) => m.id === msg.id)) {
          this.dmMessages.update((l) => [...l, msg]);
        }
        this.shouldScrollToBottom = true;
      }
    });
  }

  private setupSearchHandlers() {
    this.searchSubject.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe((q) => {
      const pid = this.activeProjectId();
      const cid = this.activeChannelId();
      if (q.length >= 2 && pid && cid) {
        this.messaging.searchChannelMessages(pid, cid, q).subscribe({
          next: (r) => this.searchResults.set(r), error: () => {},
        });
      } else {
        this.searchResults.set([]);
      }
    });

    // Recherche utilisateurs pour DM
    this.dmSearch$.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe((q) => {
      if (q.length >= 2) {
        this.messaging.searchUsers(q).subscribe({
          next: (u) => this.dmSearchResults.set(u), error: () => {},
        });
      } else {
        this.dmSearchResults.set([]);
      }
    });
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.realtime.off('message:new');
    if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
    clearInterval(this.recordingTimer);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  selectChannel(channel: Channel, projectId: string) {
    this.activeChannelId.set(channel.id);
    this.activeProjectId.set(projectId);
    this.activePane.set('channels');
    this.loadingMessages.set(true);
    this.realtime.joinChannel(channel.id);
    this.messaging.getChannelMessages(projectId, channel.id, { limit: 50 }).subscribe({
      next: (msgs) => {
        this.channelMessages.set(msgs);
        this.loadingMessages.set(false);
        this.shouldScrollToBottom = true;
      },
      error: () => this.loadingMessages.set(false),
    });
  }

  selectDm(conv: DirectMessageConversation) {
    this.activeDmId.set(conv.id);
    this.activePane.set('dm');
    this.loadingMessages.set(true);
    this.realtime.joinChannel(conv.id);
    this.messaging.getDmMessages(conv.id, { limit: 50 }).subscribe({
      next: (msgs) => {
        this.dmMessages.set(msgs);
        this.loadingMessages.set(false);
        this.shouldScrollToBottom = true;
        this.messaging.markDmRead(conv.id).subscribe();
      },
      error: () => this.loadingMessages.set(false),
    });
  }

  switchPane(pane: ActivePane) {
    this.activePane.set(pane);
    if (pane === 'dm' && this.conversations().length === 0) this.loadDms();
  }

  // ── Créer un channel ──────────────────────────────────────────────────────

  openNewChannelModal(group: ProjectChannelGroup) {
    this.newChannelProject.set(group);
    this.newChannelName = '';
    this.showNewChannelModal.set(true);
  }

  createChannel() {
    const group = this.newChannelProject();
    if (!group || !this.newChannelName.trim()) return;
    this.creatingChannel.set(true);
    this.messaging.createChannel(group.projectId, this.newChannelName.trim()).subscribe({
      next: (ch) => {
        this.projectGroups.update((groups) =>
          groups.map((g) =>
            g.projectId === group.projectId
              ? { ...g, channels: [...g.channels, ch] }
              : g,
          ),
        );
        this.showNewChannelModal.set(false);
        this.creatingChannel.set(false);
        this.selectChannel(ch, group.projectId);
      },
      error: () => this.creatingChannel.set(false),
    });
  }

  // ── Créer une DM ─────────────────────────────────────────────────────────

  openNewDmModal() {
    this.dmSearchQuery = '';
    this.dmSearchResults.set([]);
    this.showNewDmModal.set(true);
  }

  onDmSearch(value: string) {
    this.dmSearchQuery = value;
    this.dmSearch$.next(value);
  }

  startDmWith(user: any) {
    this.creatingDm.set(true);
    this.messaging.getOrCreateDm(user.id).subscribe({
      next: (conv) => {
        this.conversations.update((list) => {
          const exists = list.find((c) => c.id === conv.id);
          return exists ? list : [conv, ...list];
        });
        this.showNewDmModal.set(false);
        this.creatingDm.set(false);
        this.selectDm(conv);
      },
      error: () => this.creatingDm.set(false),
    });
  }

  // ── Fichier attaché ──────────────────────────────────────────────────────

  onFileSelect(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.attachedFile = file;
    const t = file.type;
    if (t.startsWith('image/')) {
      this.attachedType.set('image');
      const r = new FileReader();
      r.onload = (e) => { this.attachedPreview = e.target?.result as string; };
      r.readAsDataURL(file);
    } else if (t.startsWith('video/')) {
      this.attachedType.set('video'); this.attachedPreview = null;
    } else if (t.startsWith('audio/')) {
      this.attachedType.set('audio'); this.attachedPreview = null;
    } else {
      this.attachedType.set('file'); this.attachedPreview = null;
    }
  }

  clearAttachment() {
    this.attachedFile = null; this.attachedPreview = null; this.attachedType.set(null);
    if (this.fileInputRef?.nativeElement) this.fileInputRef.nativeElement.value = '';
  }

  // ── Enregistrement vocal ─────────────────────────────────────────────────

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.attachedFile = new File([blob], `vocal_${Date.now()}.webm`, { type: 'audio/webm' });
        this.attachedType.set('audio'); this.attachedPreview = null;
        clearInterval(this.recordingTimer); this.isRecording.set(false);
      };
      this.mediaRecorder.start();
      this.isRecording.set(true); this.recordingSeconds.set(0);
      this.recordingTimer = setInterval(() => this.recordingSeconds.update((s) => s + 1), 1000);
    } catch { alert('Impossible d\'accéder au microphone.'); }
  }

  stopRecording() {
    if (this.mediaRecorder?.state === 'recording') this.mediaRecorder.stop();
  }

  formatRecordingTime(): string {
    const s = this.recordingSeconds();
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // ── Envoi ─────────────────────────────────────────────────────────────────

  sendMessage() {
    const msg = this.newMessage.trim();
    if (!msg && !this.attachedFile) return;
    if (this.sending()) return;
    this.sending.set(true);

    if (this.attachedFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.doSend({
          content: msg || this.attachedFile!.name,
          type: this.fileTypeToMsgType(this.attachedFile!.type),
          fileUrl: e.target?.result as string,
        });
      };
      reader.readAsDataURL(this.attachedFile);
    } else {
      this.doSend({ content: msg, type: 'TEXT' });
    }
  }

  private doSend(payload: { content: string; type?: string; fileUrl?: string }) {
    const pid = this.activeProjectId();
    const send$ = this.activePane() === 'channels' && pid && this.activeChannelId()
      ? this.messaging.sendToChannel(pid, this.activeChannelId()!, payload)
      : this.activePane() === 'dm' && this.activeDmId()
      ? this.messaging.sendDm(this.activeDmId()!, payload)
      : null;

    if (!send$) { this.sending.set(false); return; }

    send$.subscribe({
      next: (newMsg) => {
        if (this.activePane() === 'channels') {
          if (!this.channelMessages().find((m) => m.id === newMsg.id))
            this.channelMessages.update((l) => [...l, newMsg]);
        } else {
          if (!this.dmMessages().find((m) => m.id === newMsg.id))
            this.dmMessages.update((l) => [...l, newMsg]);
        }
        this.newMessage = ''; this.clearAttachment();
        this.sending.set(false); this.shouldScrollToBottom = true;
      },
      error: () => this.sending.set(false),
    });
  }

  private fileTypeToMsgType(mime: string): string {
    if (mime.startsWith('image/')) return 'IMAGE';
    if (mime.startsWith('video/')) return 'VIDEO';
    if (mime.startsWith('audio/')) return 'AUDIO';
    return 'FILE';
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────

  onSearchInput(v: string) { this.searchQuery = v; this.searchSubject.next(v); }

  getOtherParticipant(conv: DirectMessageConversation) {
    const me = this.auth.currentUser()?.id;
    return conv.participants.find((p) => p.userId !== me)?.user;
  }

  isMine(msg: ChatMessage): boolean { return msg.senderId === this.auth.currentUser()?.id; }

  lastMessage(conv: DirectMessageConversation): string {
    const last = conv.messages?.[0];
    if (!last) return '';
    if (last.type === 'IMAGE') return '[Image]';
    if (last.type === 'AUDIO') return '[Audio]';
    if (last.type === 'VIDEO') return '[Video]';
    if (last.type === 'FILE')  return '[Fichier]';
    return last.content;
  }

  private scrollToBottom() {
    try { const el = this.messageListRef?.nativeElement; if (el) el.scrollTop = el.scrollHeight; } catch {}
  }
}
