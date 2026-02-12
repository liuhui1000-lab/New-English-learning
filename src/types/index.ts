export type UserRole = 'admin' | 'student';
export type UserStatus = 'pending' | 'active' | 'frozen';

export interface UserProfile {
    id: string;
    username: string;
    display_name?: string;
    role: UserRole;
    status: UserStatus;
    created_at: string;
    last_login?: string;
}

export type QuestionType = 'word_transformation' | 'collocation' | 'grammar' | 'vocabulary';

export interface Question {
    id: string;
    type: QuestionType;
    content: string; // The sentence with blank or OCR text
    answer: string;
    hint?: string; // Root word or hint
    image_url?: string; // Fallback for bad OCR
    explanation?: string;
    tags: string[]; // ["Grammar:Tense", "Collocation:look forward"]
    occurrence_count: number;
    source_material_id?: string;
    created_at: string;
}

export interface StudyRecord {
    user_id: string;
    question_id: string;
    status: 'new' | 'learning' | 'reviewing' | 'mastered';
    attempts: number;
    last_practiced_at: string;
    next_review_at?: string; // For spaced repetition
}

export interface ImportHistory {
    id: string;
    filename: string;
    import_date: string;
    question_count: number;
    status: 'success' | 'failed';
}
