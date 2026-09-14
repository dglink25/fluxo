import { Component, OnInit } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'flx-login',
  standalone: true,
  imports: [CommonModule, RouterLink, IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit() {
    // Si déjà connecté et vérifié, aller directement au dashboard
    if (this.auth.isAuthenticated() && this.auth.currentUser()?.phoneVerified) {
      this.router.navigate(['/dashboard']);
    }
  }

  loginWith(provider: 'google' | 'github') {
    this.auth.loginWithProvider(provider);
  }
}
