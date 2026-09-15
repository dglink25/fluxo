import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'flx-landing',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent {
  constructor(public auth: AuthService) {}

  get isLoggedIn(): boolean { return this.auth.isAuthenticated(); }

  mobileMenuOpen = false;

  toggleMobileMenu() { this.mobileMenuOpen = !this.mobileMenuOpen; }
  closeMobileMenu()  { this.mobileMenuOpen = false; }

  features = [
    {
      icon: 'kanban',
      title: 'Kanban & Listes',
      desc: 'Visualisez l\'avancement de vos projets en temps réel avec des tableaux Kanban intuitifs.',
    },
    {
      icon: 'comment',
      title: 'Messagerie intégrée',
      desc: 'Channels par projet, messages directs, vocaux et fichiers — tout au même endroit.',
    },
    {
      icon: 'video',
      title: 'Visioconférence',
      desc: 'Démarrez un appel vidéo depuis n\'importe quel channel en un clic.',
    },
    {
      icon: 'lock',
      title: 'Secrets & Variables',
      desc: 'Stockez vos variables d\'environnement et fichiers confidentiels chiffrés AES-256.',
    },
    {
      icon: 'github',
      title: 'Intégration GitHub',
      desc: 'Liez vos commits à vos tâches et fermez-les automatiquement via votre historique Git.',
    },
    {
      icon: 'bell',
      title: 'Notifications push',
      desc: 'Ne manquez aucune mise à jour grâce aux notifications en temps réel sur tous vos appareils.',
    },
  ];

  testimonials = [
    {
      name: 'Moussa Diallo',
      role: 'CTO, FinTech Dakar',
      text: 'Fluxo a transformé notre façon de collaborer. Tout notre équipe distribué travaille maintenant comme si on était dans le même bureau.',
      avatar: 'MD',
    },
    {
      name: 'Aminata Koné',
      role: 'Lead Developer, Abidjan',
      text: 'L\'intégration GitHub est exactement ce dont j\'avais besoin. Les commits lient automatiquement les tâches, c\'est magique.',
      avatar: 'AK',
    },
    {
      name: 'Jean-Pierre Fotso',
      role: 'Product Manager, Douala',
      text: 'Interface épurée, messagerie puissante, et les secrets chiffrés nous ont permis de centraliser toute notre configuration.',
      avatar: 'JF',
    },
  ];

  stats = [
    { value: '100%', label: 'Open source & privé', sub: 'vos données restent chez vous' },
    { value: '50 Mo', label: 'Upload fichiers', sub: 'par message ou document' },
    { value: '5 min', label: 'Pour démarrer', sub: 'connexion Google ou GitHub' },
  ];
}