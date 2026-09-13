import { Component } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'flx-login',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  constructor(private auth: AuthService) {}

  loginWith(provider: 'google' | 'github') {
    this.auth.loginWithProvider(provider);
  }
}
