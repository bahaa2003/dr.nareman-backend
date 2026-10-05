export interface TestimonialImageReference {
  url: string;
  alt: string;
}

export interface Testimonial {
  image: TestimonialImageReference;
  isVisible: boolean;
  sortOrder: number;
  privacyConfirmedAt: Date;
  publicationApprovedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TestimonialPersistenceShape extends Testimonial {
  _id: { toString(): string };
}

export interface SafeAdminTestimonial {
  id: string;
  image: TestimonialImageReference;
  isVisible: boolean;
  sortOrder: number;
  privacyConfirmedAt: string;
  publicationApprovedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicTestimonial {
  id: string;
  image: TestimonialImageReference;
}

export interface TestimonialListInput {
  page: number;
  limit: number;
  isVisible?: boolean | undefined;
}

export interface PublicTestimonialListInput {
  limit: number;
}
