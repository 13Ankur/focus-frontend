import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dog-character',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dog-character.component.html',
  styleUrls: ['./dog-character.component.scss']
})
export class DogCharacterComponent {
  @Input() isActive: boolean = false;
  @Input() breedName: string = 'Your buddy';
  @Input() breedImage: string = 'assets/images/golden_retriever.png';

  get imageSrc(): string {
    // Always use the breed's image - the eating state is shown via animations
    return this.breedImage;
  }

  get altText(): string {
    return this.isActive ? `${this.breedName} eating` : `${this.breedName} waiting for food`;
  }
}
