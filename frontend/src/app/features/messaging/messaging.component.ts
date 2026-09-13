import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewChecked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessagingService } from '../../core/services/messaging.service';
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
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  activePane = signal<ActivePane>('channels');
  projectId = signal<string | null>(null);

  channels = signal<Channel[]>([]);
  activeChannelId = signal<string | null>(null);
  channelMessages = signal<ChatMessage[]>([]);

  conversations = signal<DirectMessageConversation[]>([]);
  activeDmId = signal<string | null>(null);
  dmMessages = signal<ChatMessage[]>([]);

  loadingMessages = signal(false);
  newMessage = '';
  sending = signal(false);

  // Fichier attaché
  attachedFile: File | null = null;
  attachedPreview: string | null = null;
  attachedType = signal<'image' | 'video' | 'audio' | 'file' | null>(null);

  // Enregistrement vocal
  isRecording = signal(false);
  recordingSeconds = signal(0);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer?: ReturnType<typeof setInterval>;

  // Recherche
  searchQuery = '';
  searchResults = signal<ChatMessage[]>([]);
  showSearch = signal(false);

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;

  activeMessages = computed(() =>
    this.activePane() === 'channels' ? this.channelMessages() : this.dmMessages(),
  );

  constructor(
    private route: ActivatedRoute,
    private messaging: MessagingService,
    public auth: AuthService,
    private realtime: RealtimeService,
  ) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      const pid = params.get('projectId');
      if (pid && pid !== this.projectId()) {
        this.projectId.set(pid);
        this.loadChannels(pid);
      }
    });

    this.messaging.listDms().subscribe({
      next: (convs) => {
        this.conversations.set(convs);
        if (!this.projectId() && convs.length > 0) {
          this.activePane.set('dm');
          this.selectDm(convs[0]);
        }
      },
      error: () => {},
    });

    this.realtime.on<ChatMessage>('message:new', (msg) => {
      if (msg.channelId === this.activeChannelId()) {
        this.channelMessages.update((list) => [...list, msg]);
        this.shouldScrollToBottom = true;
      } else if (msg.dmId === this.activeDmId()) {
        this.dmMessages.update((list) => [...list, msg]);
        this.shouldScrollToBottom = true;
      }
    });

    this.searchSubject.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe((q) => {
      const pid = this.projectId();
      const cid = this.activeChannelId();
      if (q.length >= 2 && pid && cid) {
        this.messaging.searchChannelMessages(pid, cid, q).subscribe({
          next: (r) => this.searchResults.set(r),
          error: () => {},
        });
      } else {
        this.searchResults.set([]);
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
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
    clearInterval(this.recordingTimer);
  }

  loadChannels(projectId: string) {
    this.messaging.listChannels(projectId).subscribe({
      next: (channels) => {
        this.channels.set(channels);
        if (channels.length > 0) this.selectChannel(channels[0]);
      },
      error: () => {},
    });
  }

  selectChannel(channel: Channel) {
    this.activeChannelId.set(channel.id);
    this.activePane.set('channels');
    this.loadingMessages.set(true);
    const pid = this.projectId();
    if (!pid) return;
    this.realtime.joinChannel(channel.id);
    this.messaging.getChannelMessages(pid, channel.id, { limit: 50 }).subscribe({
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
        this.dmMessages.update(() => msgs);
        this.loadingMessages.set(false);
        this.shouldScrollToBottom = true;
        this.messaging.markDmRead(conv.id).subscribe();
      },
      error: () => this.loadingMessages.set(false),
    });
  }

  // ── Fichier attaché ──────────────────────────────────────────────────────

  onFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.attachedFile = file;
    const t = file.type;
    if (t.startsWith('image/')) {
      this.attachedType.set('image');
      const reader = new FileReader();
      reader.onload = (e) => { this.attachedPreview = e.target?.result as string; };
      reader.readAsDataURL(file);
    } else if (t.startsWith('video/')) {
      this.attachedType.set('video');
      this.attachedPreview = null;
    } else if (t.startsWith('audio/')) {
      this.attachedType.set('audio');
      this.attachedPreview = null;
    } else {
      this.attachedType.set('file');
      this.attachedPreview = null;
    }
  }

  clearAttachment() {
    this.attachedFile = null;
    this.attachedPreview = null;
    this.attachedType.set(null);
    if (this.fileInputRef?.nativeElement) this.fileInputRef.nativeElement.value = '';
  }

  // ── Enregistrement vocal ─────────────────────────────────────────────────

  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.audioChunks.push(e.data);
      };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const file = new File([blob], `vocal_${Date.now()}.webm`, { type: 'audio/webm' });
        this.attachedFile = file;
        this.attachedType.set('audio');
        this.attachedPreview = null;
        clearInterval(this.recordingTimer);
        this.isRecording.set(false);
      };
      this.mediaRecorder.start();
      this.isRecording.set(true);
      this.recordingSeconds.set(0);
      this.recordingTimer = setInterval(() => {
        this.recordingSeconds.update((s) => s + 1);
      }, 1000);
    } catch {
      alert('Impossible d\'accéder au microphone. Vérifiez les permissions.');
    }
  }

  stopRecording() {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
    }
  }

  formatRecordingTime(): string {
    const s = this.recordingSeconds();
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // ── Envoi ────────────────────────────────────────────────────────────────

  sendMessage() {
    const msg = this.newMessage.trim();
    if (!msg && !this.attachedFile) return;
    if (this.sending()) return;
    this.sending.set(true);

    if (this.attachedFile) {
      // Lire le fichier en base64 et envoyer avec le message
      const reader = new FileReader();
      reader.onload = (e) => {
        const fileUrl = e.target?.result as string;
        const msgType = this.fileTypeToMsgType(this.attachedFile!.type);
        const payload = {
          content: msg || this.attachedFile!.name,
          type: msgType,
          fileUrl,
        };
        this.doSend(payload);
      };
      reader.readAsDataURL(this.attachedFile);
    } else {
      this.doSend({ content: msg, type: 'TEXT' });
    }
  }

  private doSend(payload: { content: string; type?: string; fileUrl?: string }) {
    const pid = this.projectId();
    const send$ = this.activePane() === 'channels' && pid && this.activeChannelId()
      ? this.messaging.sendToChannel(pid, this.activeChannelId()!, payload)
      : this.activePane() === 'dm' && this.activeDmId()
      ? this.messaging.sendDm(this.activeDmId()!, payload)
      : null;

    if (!send$) { this.sending.set(false); return; }

    send$.subscribe({
      next: (newMsg) => {
        if (this.activePane() === 'channels') {
          this.channelMessages.update((list) => [...list, newMsg]);
        } else {
          this.dmMessages.update((list) => [...list, newMsg]);
        }
        this.newMessage = '';
        this.clearAttachment();
        this.sending.set(false);
        this.shouldScrollToBottom = true;
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

  onSearchInput(value: string) {
    this.searchQuery = value;
    this.searchSubject.next(value);
  }

  getOtherParticipant(conv: DirectMessageConversation) {
    const me = this.auth.currentUser()?.id;
    return conv.participants.find((p) => p.userId !== me)?.user;
  }

  isMine(msg: ChatMessage): boolean {
    return msg.senderId === this.auth.currentUser()?.id;
  }

  lastMessage(conv: DirectMessageConversation): string {
    const last = conv.messages?.[0];
    if (!last) return '';
    if (last.type === 'IMAGE') return '🖼️ Image';
    if (last.type === 'AUDIO') return '🎵 Audio';
    if (last.type === 'VIDEO') return '🎬 Vidéo';
    if (last.type === 'FILE') return '📎 Fichier';
    return last.content;
  }

  isImage(url: string): boolean {
    return url.startsWith('data:image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
  }

  isAudio(url: string, type?: string): boolean {
    return (type === 'AUDIO') || url.startsWith('data:audio/') || /\.(mp3|ogg|wav|webm|m4a)$/i.test(url);
  }

  isVideo(url: string, type?: string): boolean {
    return (type === 'VIDEO') || url.startsWith('data:video/') || /\.(mp4|webm|ogv|mov)$/i.test(url);
  }

  isFile(type?: string): boolean {
    return type === 'FILE';
  }

  private scrollToBottom() {
    try {
      const el = this.messageListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { /* noop */ }
  }
}
