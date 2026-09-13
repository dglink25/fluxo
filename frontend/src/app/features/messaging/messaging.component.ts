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
import { ActivatedRoute } from '@angular/router';
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
  imports: [CommonModule, FormsModule, NavbarComponent, BottomNavComponent, IconComponent],
  templateUrl: './messaging.component.html',
  styleUrl: './messaging.component.scss',
})
export class MessagingComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messageList') messageListRef!: ElementRef<HTMLDivElement>;

  activePane = signal<ActivePane>('channels');
  projectId = signal<string | null>(null);

  // Channels
  channels = signal<Channel[]>([]);
  activeChannelId = signal<string | null>(null);
  channelMessages = signal<ChatMessage[]>([]);

  // DMs
  conversations = signal<DirectMessageConversation[]>([]);
  activeDmId = signal<string | null>(null);
  dmMessages = signal<ChatMessage[]>([]);

  loadingMessages = signal(false);
  newMessage = '';
  sending = signal(false);

  // Recherche dans le channel
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
    // Récupérer le projectId depuis les query params (optionnel)
    this.route.queryParamMap.subscribe((params) => {
      const pid = params.get('projectId');
      if (pid) {
        this.projectId.set(pid);
        this.loadChannels(pid);
      }
    });

    // Charger les DMs
    this.messaging.listDms().subscribe({
      next: (convs) => this.conversations.set(convs),
      error: () => {},
    });

    // Écouter les nouveaux messages via WebSocket
    this.realtime.on<ChatMessage>('message:new', (msg) => {
      if (msg.channelId === this.activeChannelId()) {
        this.channelMessages.update((list) => [...list, msg]);
        this.shouldScrollToBottom = true;
      } else if (msg.dmId === this.activeDmId()) {
        this.dmMessages.update((list) => [...list, msg]);
        this.shouldScrollToBottom = true;
      }
    });

    // Recherche avec debounce
    this.searchSubject.pipe(debounceTime(300), takeUntil(this.destroy$)).subscribe((q) => {
      const pid = this.projectId();
      const cid = this.activeChannelId();
      if (q.length >= 2 && pid && cid) {
        this.messaging.searchChannelMessages(pid, cid, q).subscribe({
          next: (results) => this.searchResults.set(results),
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

    // Rejoindre la salle WebSocket
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
        this.dmMessages.set(msgs);
        this.loadingMessages.set(false);
        this.shouldScrollToBottom = true;
        // Marquer comme lus
        this.messaging.markDmRead(conv.id).subscribe();
      },
      error: () => this.loadingMessages.set(false),
    });
  }

  sendMessage() {
    const msg = this.newMessage.trim();
    if (!msg || this.sending()) return;

    this.sending.set(true);
    const pid = this.projectId();

    if (this.activePane() === 'channels' && pid && this.activeChannelId()) {
      this.messaging.sendToChannel(pid, this.activeChannelId()!, { content: msg }).subscribe({
        next: (newMsg) => {
          this.channelMessages.update((list) => [...list, newMsg]);
          this.newMessage = '';
          this.sending.set(false);
          this.shouldScrollToBottom = true;
        },
        error: () => this.sending.set(false),
      });
    } else if (this.activePane() === 'dm' && this.activeDmId()) {
      this.messaging.sendDm(this.activeDmId()!, { content: msg }).subscribe({
        next: (newMsg) => {
          this.dmMessages.update((list) => [...list, newMsg]);
          this.newMessage = '';
          this.sending.set(false);
          this.shouldScrollToBottom = true;
        },
        error: () => this.sending.set(false),
      });
    }
  }

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
    return conv.messages?.[0]?.content ?? '';
  }

  private scrollToBottom() {
    try {
      const el = this.messageListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    } catch { /* noop */ }
  }
}
