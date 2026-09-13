import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged, Subject, switchMap, of } from 'rxjs';
import { SearchService, SearchResults } from '../../core/services/search.service';
import { NavbarComponent } from '../../shared/components/navbar/navbar.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { IconComponent } from '../../shared/components/icon/icon.component';

@Component({
  selector: 'flx-search',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, NavbarComponent, BottomNavComponent, IconComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent {
  query = '';
  loading = signal(false);
  results = signal<SearchResults | null>(null);

  private search$ = new Subject<string>();

  constructor(private searchService: SearchService) {
    this.search$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((q) => {
          if (q.trim().length < 2) {
            this.results.set(null);
            return of(null);
          }
          this.loading.set(true);
          return this.searchService.search(q);
        }),
      )
      .subscribe({
        next: (res) => {
          if (res) this.results.set(res);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  onInput(value: string) {
    this.query = value;
    this.search$.next(value);
  }

  totalResults(): number {
    const r = this.results();
    if (!r) return 0;
    return r.projects.length + r.tasks.length + r.users.length + r.messages.length;
  }

  highlight(text: string): string {
    if (!this.query.trim() || !text) return text;
    const escaped = this.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(escaped, 'gi'), (m) => `<mark>${m}</mark>`);
  }
}
