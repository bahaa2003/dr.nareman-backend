import { AppError } from "../../shared/errors/AppError.js";
import { logger } from "../../utils/logger.js";
import { isManagedTestimonialUrl, localMediaStorage } from "../media/localMediaStorage.js";
import { TestimonialModel, type TestimonialDocument } from "./testimonial.model.js";
import type { TestimonialUpdateInput } from "./testimonial.schema.js";
import type {
  PublicTestimonial,
  PublicTestimonialListInput,
  SafeAdminTestimonial,
  TestimonialListInput,
  TestimonialPersistenceShape
} from "./testimonial.types.js";

const publicSafetyFilter = {
  isVisible: true,
  privacyConfirmedAt: { $type: "date" as const },
  publicationApprovedAt: { $type: "date" as const },
  "image.url": /^\/uploads\/testimonials\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/i
};

export function toSafeAdminTestimonial(testimonial: TestimonialPersistenceShape): SafeAdminTestimonial {
  return {
    id: testimonial._id.toString(),
    image: { url: testimonial.image.url, alt: testimonial.image.alt },
    isVisible: testimonial.isVisible,
    sortOrder: testimonial.sortOrder,
    privacyConfirmedAt: testimonial.privacyConfirmedAt.toISOString(),
    publicationApprovedAt: testimonial.publicationApprovedAt.toISOString(),
    createdAt: testimonial.createdAt.toISOString(),
    updatedAt: testimonial.updatedAt.toISOString()
  };
}

function toPublicTestimonial(testimonial: TestimonialPersistenceShape): PublicTestimonial {
  return { id: testimonial._id.toString(), image: { url: testimonial.image.url, alt: testimonial.image.alt } };
}

export async function createTestimonial(alt: string, imageBuffer: Buffer): Promise<SafeAdminTestimonial> {
  const sortOrder = await getNextSortOrder();
  const storedMedia = await localMediaStorage.saveTestimonial(imageBuffer);
  const confirmedAt = new Date();

  try {
    const testimonial = await TestimonialModel.create({
      image: { url: storedMedia.url, alt },
      isVisible: false,
      sortOrder,
      privacyConfirmedAt: confirmedAt,
      publicationApprovedAt: confirmedAt
    });
    return toSafeAdminTestimonial(testimonial);
  } catch (error) {
    await cleanupNewMediaAfterFailedPersistence(storedMedia.url);
    throw error;
  }
}

export async function listAdminTestimonials(input: TestimonialListInput) {
  const filter = input.isVisible === undefined ? {} : { isVisible: input.isVisible };
  const skip = (input.page - 1) * input.limit;
  const [items, total] = await Promise.all([
    TestimonialModel.find(filter).sort({ sortOrder: 1, _id: 1 }).skip(skip).limit(input.limit).lean<TestimonialPersistenceShape[]>(),
    TestimonialModel.countDocuments(filter)
  ]);
  return {
    items: items.map(toSafeAdminTestimonial),
    pagination: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) }
  };
}

export async function getAdminTestimonial(id: string): Promise<SafeAdminTestimonial> {
  const testimonial = await findTestimonial(id);
  return toSafeAdminTestimonial(testimonial);
}

export async function updateTestimonial(id: string, input: TestimonialUpdateInput): Promise<SafeAdminTestimonial> {
  const testimonial = await findTestimonial(id);

  if (input.alt !== undefined) {
    testimonial.image = { url: testimonial.image.url, alt: input.alt };
  }
  if (input.sortOrder !== undefined) {
    testimonial.sortOrder = input.sortOrder;
  }
  if (input.isVisible !== undefined) {
    if (input.isVisible) {
      await assertCanBeVisible(testimonial);
    }
    testimonial.isVisible = input.isVisible;
  }

  await testimonial.save();
  return toSafeAdminTestimonial(testimonial);
}

export async function replaceTestimonialImage(
  id: string,
  alt: string,
  imageBuffer: Buffer
): Promise<SafeAdminTestimonial> {
  const testimonial = await findTestimonial(id);
  const previousUrl = testimonial.image.url;
  const storedMedia = await localMediaStorage.saveTestimonial(imageBuffer);
  const confirmedAt = new Date();

  try {
    testimonial.image = { url: storedMedia.url, alt };
    // The caller supplied the two required attestations. A previously visible
    // item may remain visible only after this fully confirmed replacement.
    testimonial.privacyConfirmedAt = confirmedAt;
    testimonial.publicationApprovedAt = confirmedAt;
    if (testimonial.isVisible) {
      await assertCanBeVisible(testimonial);
    }
    await testimonial.save();
  } catch (error) {
    await cleanupNewMediaAfterFailedPersistence(storedMedia.url);
    throw error;
  }

  await cleanupPreviousMedia(previousUrl, "testimonial replacement");
  return toSafeAdminTestimonial(testimonial);
}

export async function deleteTestimonial(id: string): Promise<void> {
  const testimonial = await TestimonialModel.findByIdAndDelete(id);
  if (!testimonial) {
    throw new AppError("Testimonial not found", 404);
  }

  await cleanupPreviousMedia(testimonial.image.url, "testimonial deletion");
}

export async function listPublicTestimonials(input: PublicTestimonialListInput): Promise<PublicTestimonial[]> {
  const testimonials = await TestimonialModel.find(publicSafetyFilter)
    .sort({ sortOrder: 1, _id: 1 })
    .limit(input.limit)
    .lean<TestimonialPersistenceShape[]>();
  return testimonials.map(toPublicTestimonial);
}

async function findTestimonial(id: string): Promise<TestimonialDocument> {
  const testimonial = await TestimonialModel.findById(id);
  if (!testimonial) {
    throw new AppError("Testimonial not found", 404);
  }
  return testimonial;
}

async function assertCanBeVisible(testimonial: TestimonialDocument): Promise<void> {
  if (
    !testimonial.image ||
    !isManagedTestimonialUrl(testimonial.image.url) ||
    !testimonial.privacyConfirmedAt ||
    !testimonial.publicationApprovedAt ||
    !(await localMediaStorage.hasTestimonial(testimonial.image.url))
  ) {
    throw new AppError("Testimonial cannot be made visible without confirmed managed media", 400);
  }
}

async function getNextSortOrder(): Promise<number> {
  const last = await TestimonialModel.findOne().sort({ sortOrder: -1, _id: -1 }).select("sortOrder").lean<{ sortOrder: number } | null>();
  return last ? Math.min(last.sortOrder + 1, 1_000_000) : 0;
}

async function cleanupNewMediaAfterFailedPersistence(url: string): Promise<void> {
  try {
    await localMediaStorage.deleteTestimonial(url);
  } catch (error) {
    logger.warn({ errorName: getErrorName(error) }, "Failed to clean up newly stored testimonial media");
  }
}

async function cleanupPreviousMedia(url: string, operation: string): Promise<void> {
  try {
    await localMediaStorage.deleteTestimonial(url);
  } catch (error) {
    logger.warn({ errorName: getErrorName(error), operation }, "Failed to clean up testimonial media");
  }
}

function getErrorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}
