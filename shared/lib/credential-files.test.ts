import { describe, expect, it } from 'vitest';
import { CREDENTIAL_STATUS_LABELS, type AuthUser } from '@shared/types/domain';
import { studentCredentialPolicy } from './policies';
import {
  CREDENTIAL_UPLOAD_ACCEPT, CREDENTIAL_UPLOAD_MAX_BYTES, CREDENTIAL_UPLOAD_MAX_LABEL, CREDENTIAL_UPLOAD_TYPES,
  credentialFileLabel, fileTypeLabel, isPreviewable, precheckCredentialFile,
} from './credential-files';

const user = (roles: string[], permissions: string[] = []) => ({ id: '1', name: 'X', email: 'x@example.test', roles, permissions }) as unknown as AuthUser;

describe('what a credential file may be', () => {
  it('PDF, JPG, JPEG and PNG only', () => {
    expect(Object.keys(CREDENTIAL_UPLOAD_TYPES).sort()).toEqual(['jpeg', 'jpg', 'pdf', 'png']);
    expect(CREDENTIAL_UPLOAD_ACCEPT).toBe('.pdf,.jpg,.jpeg,.png');
  });
  it('the browser’s pre-check names the problem before anything is sent', () => {
    expect(precheckCredentialFile({ name: 'birth-certificate.pdf', size: 1000 })).toBeNull();
    expect(precheckCredentialFile({ name: 'scan.JPG', size: 1000 })).toBeNull();
    expect(precheckCredentialFile({ name: 'form.docx', size: 1000 })).toMatch(/PDF, JPG or PNG/);
    expect(precheckCredentialFile({ name: 'no-extension', size: 1000 })).toMatch(/PDF, JPG or PNG/);
    expect(precheckCredentialFile({ name: 'big.pdf', size: 4 * 1024 * 1024 + 1 })).toMatch(/4 MB/);
    expect(precheckCredentialFile({ name: 'empty.pdf', size: 0 })).toMatch(/empty/);
  });
  it('PDFs and images can be previewed in the browser', () => {
    expect(isPreviewable('application/pdf')).toBe(true);
    expect(isPreviewable('image/png')).toBe(true);
    expect(isPreviewable('application/msword')).toBe(false);
    expect(isPreviewable(null)).toBe(false);
  });
});

describe('credentialFileLabel', () => {
  it('the uploaded file’s own name when it is known', () => {
    expect(credentialFileLabel({ fileName: 'psa-birth-cert.pdf', filePath: 'students/1/a1b2.pdf', requirementName: 'PSA Birth Certificate', version: 2 })).toBe('psa-birth-cert.pdf');
  });
  it('a file from before names were kept: the requirement and version', () => {
    expect(credentialFileLabel({ fileName: null, filePath: 'applications/9/ff.pdf', requirementName: 'PSA Birth Certificate', version: 1 })).toBe('PSA Birth Certificate (v1).pdf');
  });
  it('no file, no label', () => {
    expect(credentialFileLabel({ fileName: null, filePath: null, requirementName: 'Form 137', version: 1 })).toBeNull();
  });
});

describe('studentCredentialPolicy.upload', () => {
  it('whoever may verify credentials or manage students may upload', () => {
    expect(studentCredentialPolicy.upload(user(['secretary'], ['credentials.verify']))).toBe(true);
    expect(studentCredentialPolicy.upload(user(['processing_officer'], ['students.manage']))).toBe(true);
  });
  it('a viewer without either permission may not', () => {
    expect(studentCredentialPolicy.upload(user(['director']))).toBe(false);
    expect(studentCredentialPolicy.upload(user(['teacher']))).toBe(false);
    expect(studentCredentialPolicy.upload(user(['student']))).toBe(false);
  });
});

describe('studentCredentialPolicy.replaceVerified', () => {
  it('only a credential verifier may replace a verified document', () => {
    expect(studentCredentialPolicy.replaceVerified(user(['secretary'], ['credentials.verify']))).toBe(true);
    expect(studentCredentialPolicy.replaceVerified(user(['director'], ['students.manage']))).toBe(false);
    expect(studentCredentialPolicy.replaceVerified(user(['teacher']))).toBe(false);
  });
});

describe('how a document is described', () => {
  it('a short type name', () => {
    expect(fileTypeLabel('application/pdf')).toBe('PDF');
    expect(fileTypeLabel('image/jpeg')).toBe('JPG');
    expect(fileTypeLabel('image/png')).toBe('PNG');
    expect(fileTypeLabel(null)).toBeNull();
  });
  it('the limit is 4 MB, named the same everywhere', () => {
    expect(CREDENTIAL_UPLOAD_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(CREDENTIAL_UPLOAD_MAX_LABEL).toBe('4 MB');
  });
  it('an upload reads as Pending Review', () => {
    expect(CREDENTIAL_STATUS_LABELS.submitted).toBe('Pending Review');
    expect(CREDENTIAL_STATUS_LABELS.missing).toBe('Missing');
  });
});
