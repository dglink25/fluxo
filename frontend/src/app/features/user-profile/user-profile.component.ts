import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MessagingService } from '../../core/services/messaging.service';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { environment } from '../../../environments/environment';

interface PublicProfile {
  id: string;
  username: string;
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  createdAt: string;
  heatmap: { date: string; count: number }[];
  publicProjects: {
    id: string; name: string; description?: string | null;
    visibility: string; _count: { tasks: number; members: number };
  }[];
}

@Component({
  selector: 'flx-user-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent, BottomNavComponent],
  templateUrl: './user-profile.component.html',
  styleUrl: './user-profile.component.scss',
})
export class UserProfileComponent implements OnInit {
  profile = signal<PublicProfile | null>(null);
  loading = signal(true);
  startingDm = signal(false);

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private messaging: MessagingService,
  ) {}

  ngOnInit() {
    const username = this.route.snapshot.paramMap.get('username')!;
    this.http.get<PublicProfile>(`${environment.apiUrl}/users/profile/${username}`).subscribe({
      next: (p) => { this.profile.set(p); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  startDm() {
    const p = this.profile();
    if (!p) return;
    this.startingDm.set(true);
    this.messaging.getOrCreateDm(p.id).subscribe({
      next: (conv) => {
        window.location.href = `/messaging?dmId=${conv.id}`;
      },
      error: () => this.startingDm.set(false),
    });
  }

  get heatmapGrid(): { date: string; count: number; level: 0|1|2|3|4 }[][] {
    const map = new Map((this.profile()?.heatmap ?? []).map((d) => [d.date, d.count]));
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 363);
    const dayOfWeek = startDate.getDay();
    startDate.setDate(startDate.getDate() - ((dayOfWeek + 6) % 7));
    const weeks: { date: string; count: number; level: 0|1|2|3|4 }[][] = [];
    const cursor = new Date(startDate);
    for (let w = 0; w < 53; w++) {
      const week: { date: string; count: number; level: 0|1|2|3|4 }[] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = cursor.toISOString().slice(0, 10);
        const count = map.get(dateStr) ?? 0;
        const level: 0|1|2|3|4 =
          count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4;
        week.push({ date: dateStr, count, level });
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.push(week);
    }
    return weeks;
  }
}
