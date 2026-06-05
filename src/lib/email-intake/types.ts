export interface ParsedSender {
  name: string;
  email: string;
}

export interface ParsedSignature {
  name: string;
  title?: string;
  email: string;
  phone: string;
  company: string;
  address: string;
  website?: string;
}

export interface ParsedProjectFields {
  name: string;
  address: string;
  dueDate?: string;
  descriptionSnippet?: string;
}

export interface ParsedEmailIntake {
  subject: string;
  from: ParsedSender;
  bodyText: string;
  bodyHtml?: string;
  signature: ParsedSignature;
  project: ParsedProjectFields;
  isForwarded: boolean;
  originalSender?: ParsedSender;
  attachmentNames: string[];
}

export interface IntakeMatchPreview {
  contractorId?: string;
  companyId?: string;
  companyName?: string;
  projectId?: string;
  willCreateCompany: boolean;
  willCreateContractor: boolean;
  willCreateProject: boolean;
}

export interface IntakeApplyPayload {
  sessionId: string;
  company: string;
  firstName: string;
  lastName: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  projectName: string;
  projectAddress: string;
  projectDescription?: string;
  intakeDueDate?: string;
  officeId?: string;
  salespersonId?: string;
  linkExistingProjectId?: string;
  useExistingContractorId?: string;
}
