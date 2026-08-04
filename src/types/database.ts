export type Database = {
  public: {
    Tables: {
      companies: {
        Row: {
          id: number
          owner_user_id: string
          legal_name: string
          trading_name: string | null
          registration_no: string | null
          owner_name: string
          phone: string
          email: string | null
          website: string | null
          address_line_1: string | null
          address_line_2: string | null
          postcode: string | null
          city: string | null
          state: string
          country_code: string
          business_description: string | null
          cidb_registration_no: string | null
          cidb_grade: string | null
          cidb_expiry_date: string | null
          mof_registration_no: string | null
          other_license_notes: string | null
          bank_name: string | null
          bank_account_name: string | null
          bank_account_no: string | null
          logo_path: string | null
          stamp_path: string | null
          signature_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          owner_user_id: string
          legal_name: string
          trading_name?: string | null
          registration_no?: string | null
          owner_name: string
          phone: string
          email?: string | null
          website?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          postcode?: string | null
          city?: string | null
          state?: string
          country_code?: string
          business_description?: string | null
          cidb_registration_no?: string | null
          cidb_grade?: string | null
          cidb_expiry_date?: string | null
          mof_registration_no?: string | null
          other_license_notes?: string | null
          bank_name?: string | null
          bank_account_name?: string | null
          bank_account_no?: string | null
          logo_path?: string | null
          stamp_path?: string | null
          signature_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          legal_name?: string
          trading_name?: string | null
          registration_no?: string | null
          owner_name?: string
          phone?: string
          email?: string | null
          website?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          postcode?: string | null
          city?: string | null
          state?: string
          country_code?: string
          business_description?: string | null
          cidb_registration_no?: string | null
          cidb_grade?: string | null
          cidb_expiry_date?: string | null
          mof_registration_no?: string | null
          other_license_notes?: string | null
          bank_name?: string | null
          bank_account_name?: string | null
          bank_account_no?: string | null
          logo_path?: string | null
          stamp_path?: string | null
          signature_path?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      system_catalog_categories: {
        Row: {
          id: number
          code: string
          name_ms: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          code: string
          name_ms: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          code?: string
          name_ms?: string
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      system_catalog_items: {
        Row: {
          id: number
          category_id: number
          code: string
          name_ms: string
          description_ms: string
          unit: string
          default_rate: number
          price_note_ms: string | null
          guide_key: string | null
          version: number
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          category_id: number
          code: string
          name_ms: string
          description_ms: string
          unit: string
          default_rate?: number
          price_note_ms?: string | null
          guide_key?: string | null
          version?: number
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          category_id?: number
          code?: string
          name_ms?: string
          description_ms?: string
          unit?: string
          default_rate?: number
          price_note_ms?: string | null
          guide_key?: string | null
          version?: number
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      company_catalog_categories: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          source_category_id: number | null
          name: string
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          source_category_id?: number | null
          name: string
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      company_catalog_items: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          category_id: number
          source_item_id: number | null
          imported_master_version: number | null
          code: string | null
          name: string
          description: string
          unit: string
          rate: number
          price_note: string | null
          guide_key: string | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          category_id: number
          source_item_id?: number | null
          imported_master_version?: number | null
          code?: string | null
          name: string
          description: string
          unit: string
          rate?: number
          price_note?: string | null
          guide_key?: string | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          category_id?: number
          name?: string
          description?: string
          unit?: string
          rate?: number
          price_note?: string | null
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
