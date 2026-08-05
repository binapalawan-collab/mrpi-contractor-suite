export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          name: string
          phone: string
          phone_normalized: string
          email: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          name: string
          phone: string
          phone_normalized: string
          email?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          phone?: string
          phone_normalized?: string
          email?: string | null
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
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
      quotations: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          client_id: number
          site_visit_id: number | null
          draft_key: string
          quotation_no: string
          quotation_date: string
          language: string
          client_name: string
          client_phone: string
          client_email: string | null
          project_title: string
          address_line_1: string
          address_line_2: string | null
          postcode: string | null
          city: string
          state: string
          country_code: string
          validity_days: number
          status: string
          revision_no: number
          total_amount: number
          notes: string | null
          sent_at: string | null
          accepted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          client_id: number
          site_visit_id?: number | null
          draft_key?: string
          quotation_no: string
          quotation_date?: string
          language?: string
          client_name: string
          client_phone: string
          client_email?: string | null
          project_title: string
          address_line_1: string
          address_line_2?: string | null
          postcode?: string | null
          city: string
          state?: string
          country_code?: string
          validity_days?: number
          status?: string
          revision_no?: number
          total_amount?: number
          notes?: string | null
          sent_at?: string | null
          accepted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: number
          site_visit_id?: number | null
          draft_key?: string
          quotation_no?: string
          quotation_date?: string
          language?: string
          client_name?: string
          client_phone?: string
          client_email?: string | null
          project_title?: string
          address_line_1?: string
          address_line_2?: string | null
          postcode?: string | null
          city?: string
          state?: string
          country_code?: string
          validity_days?: number
          status?: string
          revision_no?: number
          total_amount?: number
          notes?: string | null
          sent_at?: string | null
          accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      quotation_sections: {
        Row: {
          id: number
          quotation_id: number
          company_id: number
          owner_user_id: string
          source_site_visit_id: number | null
          source_site_visit_area_id: number | null
          name: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          quotation_id: number
          company_id: number
          owner_user_id: string
          source_site_visit_id?: number | null
          source_site_visit_area_id?: number | null
          name: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          source_site_visit_id?: number | null
          source_site_visit_area_id?: number | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          id: number
          quotation_id: number
          section_id: number
          company_id: number
          owner_user_id: string
          catalog_item_id: number | null
          source_site_visit_id: number | null
          source_site_visit_area_id: number | null
          source_site_visit_entry_id: number | null
          item_name: string
          description: string
          measurement_text: string | null
          calculation_method: string
          unit: string
          quantity: number
          rate: number
          amount: number | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          quotation_id: number
          section_id: number
          company_id: number
          owner_user_id: string
          catalog_item_id?: number | null
          source_site_visit_id?: number | null
          source_site_visit_area_id?: number | null
          source_site_visit_entry_id?: number | null
          item_name: string
          description: string
          measurement_text?: string | null
          calculation_method?: string
          unit: string
          quantity?: number
          rate?: number
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          catalog_item_id?: number | null
          source_site_visit_id?: number | null
          source_site_visit_area_id?: number | null
          source_site_visit_entry_id?: number | null
          item_name?: string
          description?: string
          measurement_text?: string | null
          calculation_method?: string
          unit?: string
          quantity?: number
          rate?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      quotation_snapshots: {
        Row: {
          id: number
          quotation_id: number
          company_id: number
          owner_user_id: string
          revision_no: number
          snapshot_data: Json
          created_at: string
        }
        Insert: {
          id?: never
          quotation_id: number
          company_id: number
          owner_user_id: string
          revision_no: number
          snapshot_data: Json
          created_at?: string
        }
        Update: {
          revision_no?: number
          snapshot_data?: Json
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          quotation_id: number
          quotation_snapshot_id: number
          client_id: number
          site_visit_id: number | null
          project_no: string
          project_name: string
          quotation_no: string
          quotation_revision_no: number
          client_name: string
          client_phone: string
          client_email: string | null
          address_line_1: string
          address_line_2: string | null
          postcode: string | null
          city: string
          state: string
          country_code: string
          contract_amount: number
          status: string
          planned_start_date: string | null
          planned_end_date: string | null
          actual_start_date: string | null
          work_completed_at: string | null
          handed_over_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          quotation_id: number
          quotation_snapshot_id: number
          client_id: number
          site_visit_id?: number | null
          project_no: string
          project_name: string
          quotation_no: string
          quotation_revision_no: number
          client_name: string
          client_phone: string
          client_email?: string | null
          address_line_1: string
          address_line_2?: string | null
          postcode?: string | null
          city: string
          state: string
          country_code?: string
          contract_amount: number
          status?: string
          planned_start_date?: string | null
          planned_end_date?: string | null
          actual_start_date?: string | null
          work_completed_at?: string | null
          handed_over_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          project_name?: string
          status?: string
          planned_start_date?: string | null
          planned_end_date?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_sections: {
        Row: {
          id: number
          project_id: number
          company_id: number
          owner_user_id: string
          source_quotation_section_id: number
          name: string
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: never
          project_id: number
          company_id: number
          owner_user_id: string
          source_quotation_section_id: number
          name: string
          sort_order?: number
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      project_items: {
        Row: {
          id: number
          project_id: number
          section_id: number
          company_id: number
          owner_user_id: string
          source_quotation_item_id: number
          item_name: string
          description: string
          measurement_text: string | null
          calculation_method: string
          unit: string
          quantity: number
          rate: number
          amount: number
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: never
          project_id: number
          section_id: number
          company_id: number
          owner_user_id: string
          source_quotation_item_id: number
          item_name: string
          description: string
          measurement_text?: string | null
          calculation_method: string
          unit: string
          quantity: number
          rate: number
          amount: number
          sort_order?: number
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      site_visits: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          client_id: number
          project_title: string
          visit_date: string
          address_line_1: string
          address_line_2: string | null
          postcode: string | null
          city: string
          state: string
          country_code: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          client_id: number
          project_title?: string
          visit_date?: string
          address_line_1: string
          address_line_2?: string | null
          postcode?: string | null
          city: string
          state?: string
          country_code?: string
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          client_id?: number
          project_title?: string
          visit_date?: string
          address_line_1?: string
          address_line_2?: string | null
          postcode?: string | null
          city?: string
          state?: string
          country_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_visit_areas: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          site_visit_id: number
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
          site_visit_id: number
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
      site_visit_entries: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          site_visit_id: number
          area_id: number
          note_text: string
          measurement_text: string | null
          guide_key: string | null
          needs_confirmation: boolean
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          site_visit_id: number
          area_id: number
          note_text: string
          measurement_text?: string | null
          guide_key?: string | null
          needs_confirmation?: boolean
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          area_id?: number
          note_text?: string
          measurement_text?: string | null
          guide_key?: string | null
          needs_confirmation?: boolean
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      site_visit_photos: {
        Row: {
          id: number
          company_id: number
          owner_user_id: string
          site_visit_id: number
          area_id: number
          entry_id: number
          storage_path: string
          original_filename: string
          mime_type: string
          size_bytes: number
          caption: string | null
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          company_id: number
          owner_user_id: string
          site_visit_id: number
          area_id: number
          entry_id: number
          storage_path: string
          original_filename: string
          mime_type: string
          size_bytes: number
          caption?: string | null
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_site_visit_guides: {
        Row: {
          guide_key: string
          name_ms: string
          description_ms: string
          prompts_ms: Json
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          guide_key: string
          name_ms: string
          description_ms: string
          prompts_ms: Json
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          name_ms?: string
          description_ms?: string
          prompts_ms?: Json
          sort_order?: number
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      create_project_from_accepted_quotation: {
        Args: {
          p_quotation_id: number
        }
        Returns: Database['public']['Tables']['projects']['Row']
      }
      send_quotation_revision: {
        Args: {
          p_quotation_id: number
          p_revision_no: number
          p_snapshot_data: Json
        }
        Returns: Database['public']['Tables']['quotations']['Row']
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
