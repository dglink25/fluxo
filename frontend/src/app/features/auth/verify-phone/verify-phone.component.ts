import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

type Step = 'phone' | 'code';

@Component({
  selector: 'flx-verify-phone',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  templateUrl: './verify-phone.component.html',
  styleUrl: './verify-phone.component.scss',
})
export class VerifyPhoneComponent implements OnDestroy {
  step = signal<Step>('phone');
  phone = '';
  digits = signal<string[]>(['', '', '', '', '', '']);
  secondsLeft = signal(0);
  sending = signal(false);
  verifying = signal(false);
  error = signal<string | null>(null);

  private timer?: ReturnType<typeof setInterval>;

  constructor(private auth: AuthService, private router: Router) {}

  sendCode() {
    this.error.set(null);
    this.sending.set(true);
    this.auth.sendPhoneOtp(this.phone).subscribe({
      next: (res) => {
        this.sending.set(false);
        this.step.set('code');
        this.startCountdown(res.expiresInSeconds ?? 180);
      },
      error: (err) => {
        this.sending.set(false);
        this.error.set(err?.error?.message ?? "Impossible d'envoyer le code");
      },
    });
  }

  resend() {
    if (this.secondsLeft() > 0) return;
    this.sendCode();
  }

  onDigitInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value.replace(/\D/g, '').slice(-1);
    const current = [...this.digits()];
    current[index] = value;
    this.digits.set(current);

    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`) as HTMLInputElement | null;
      next?.focus();
    }
    if (current.every((d) => d)) this.verify();
  }

  onDigitKeydown(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !this.digits()[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`) as HTMLInputElement | null;
      prev?.focus();
    }
  }

  async pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const clean = text.replace(/\D/g, '').slice(0, 6).split('');
      if (clean.length === 6) {
        this.digits.set(clean);
        this.verify();
      }
    } catch {
      this.error.set('Lecture du presse-papiers impossible sur ce navigateur');
    }
  }

  verify() {
    const code = this.digits().join('');
    if (code.length !== 6) return;
    this.error.set(null);
    this.verifying.set(true);
    this.auth.verifyPhoneOtp(this.phone, code).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (err) => {
        this.verifying.set(false);
        this.error.set(err?.error?.message ?? 'Code invalide');
        this.digits.set(['', '', '', '', '', '']);
        (document.getElementById('otp-0') as HTMLInputElement | null)?.focus();
      },
    });
  }

  formattedTime() {
    const m = Math.floor(this.secondsLeft() / 60);
    const s = this.secondsLeft() % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private startCountdown(seconds: number) {
    this.secondsLeft.set(seconds);
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.secondsLeft.update((s) => Math.max(0, s - 1));
      if (this.secondsLeft() === 0) clearInterval(this.timer);
    }, 1000);
  }

  ngOnDestroy() {
    clearInterval(this.timer);
  }
}
