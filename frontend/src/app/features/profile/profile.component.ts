import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { ThemeToggleComponent } from '../../shared/components/theme-toggle/theme-toggle.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { environment } from '../../../environments/environment';

interface HeatmapDay { date: string; count: number; }

@Component({
  selector: 'flx-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, NavbarComponent, BottomNavComponent, ThemeToggleComponent, IconComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  heatmap = signal<HeatmapDay[]>([]);
  editMode = signal(false);
  saving = signal(false);

  editFullName = '';
  editBio = '';

  constructor(public auth: AuthService, private http: HttpClient) {}

  ngOnInit() {
    this.http.get<HeatmapDay[]>(`${environment.apiUrl}/users/me/heatmap`).subscribe({
      next: (data) => this.heatmap.set(data),
      error: () => {},
    });
  }

  startEdit() {
    const user = this.auth.currentUser();
    this.editFullName = user?.fullName ?? '';
    this.editBio = '';
    this.editMode.set(true);
  }

  saveProfile() {
    this.saving.set(true);
    this.http.patch<any>(`${environment.apiUrl}/users/me`, {
      fullName: this.editFullName,
      bio: this.editBio,
    }).subscribe({
      next: (updated) => {
        const current = this.auth.currentUser();
        if (current) {
          this.auth.currentUser.set({ ...current, fullName: updated.fullName });
        }
        this.saving.set(false);
        this.editMode.set(false);
      },
      error: () => this.saving.set(false),
    });
  }

  /** Calcul de la grille heatmap 52×7 à partir des données brutes */
  get heatmapGrid(): { date: string; count: number; level: 0|1|2|3|4 }[][] {
    const map = new Map(this.heatmap().map((d) => [d.date, d.count]));
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 363);

    // Aligner sur lundi
    const dayOfWeek = startDate.getDay(); // 0=dim
    startDate.setDate(startDate.getDate() - ((dayOfWeek + 6) % 7));

    const weeks: { date: string; count: number; level: 0|1|2|3|4 }[][] = [];

    let cursor = new Date(startDate);
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
