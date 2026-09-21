export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'FILE' | 'AUDIO';

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  channelId?: string | null;
  dmId?: string | null;
  type: MessageType;
  content: string;
  fileUrl?: string | null;
  delivered: boolean;
  read: boolean;
  createdAt: string;
  sender: { id: string; username: string; avatarUrl?: string | null };
  reactions: MessageReaction[];
  /** true si ce message est un message d'invitation à une visioconférence */
  isCallMessage?: boolean;
  /** URL de la salle (pour les messages d'appel) */
  callUrl?: string;
  roomId?: string;
}

export interface Channel {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export interface DirectMessageConversation {
  id: string;
  createdAt: string;
  participants: {
    id: string;
    userId: string;
    user: { id: string; username: string; avatarUrl?: string | null };
  }[];
  messages: ChatMessage[];
}
