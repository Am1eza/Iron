# Forms and validation

This guide consolidates form behavior and boundary validation. React Hook Form owns local form state; Zod validates inputs. Client validation improves feedback; server validation and authorization remain mandatory.

## Implementation map

| Concern                                   | Source                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Shared form schemas and Persian messages  | [validation directory](src/lib/validation/)                                                         |
| Request body parsing and 400 field errors | [request.ts](src/lib/validation/request.ts)                                                         |
| Environment requirements                  | [env.ts](src/lib/validation/env.ts)                                                                 |
| Labels, help text and input components    | [fields.tsx](src/components/forms/fields.tsx)                                                       |
| Mobile/OTP login                          | [LoginForm.tsx](src/components/forms/LoginForm.tsx), [auth resource](src/lib/api/resources/auth.ts) |
| Inquiry workflow                          | [RequestFlow.tsx](src/components/forms/RequestFlow.tsx)                                             |
| Contact submission                        | [ContactForm.tsx](src/components/forms/ContactForm.tsx)                                             |

Import typed resource clients directly. The obsolete `lib/api/forms.ts` forwarding facade has been removed. See [API client](API-CLIENT.md) for transport errors and cancellation.

## Submission and accessibility

1. Normalize accepted digit scripts and mobile formats, then validate against the appropriate schema.
2. Submit typed data through the resource client; disable duplicate submission while pending.
3. Map server field errors with `setError` and show a safe Persian message for general failures. Preserve entered data on failure.
4. Associate labels, descriptions and errors with inputs; expose `aria-invalid` and focus the first invalid field.
5. Allow OTP paste and use LTR direction for codes/phone numbers within the RTL form.

OTP values come from [constants.ts](src/lib/config/constants.ts) and server responses. Current defaults are six digits, 900-second validity, 60-second resend cooldown, five resends per hour, five attempts and a 15-minute lock. Do not hardcode the retired five-digit demo code: authentication uses real route handlers even when catalog data is mocked.

## Boundary validation

`validateBody` parses JSON with a Zod schema and returns a 400 response with `error`, `message` and `fields` on failure. Choose schemas for the actual request; never treat a browser type assertion as validation. Validate URL enums and external responses at their respective boundaries, and compute money/weights in server domain code.

Environment validation is lazy on the server; required values depend on mode and environment. Consult `env.ts` rather than duplicating its conditional requirements here. AI keys use the provider-neutral configuration described in [AI](AI.md).

React escapes text by default. Content renderers that accept HTML must sanitize it; see the existing rendering path before adding one. Database queries must remain parameterized.

## Verification

Exercise malformed input, Persian/Arabic digits, mobile normalization, boundary values, accessible error feedback and server rejection. Use existing schema/component tests and the commands in [README](README.md).
