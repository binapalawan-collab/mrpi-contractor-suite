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
          length_value: number | null
          width_value: number | null
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
          length_value?: number | null
          width_value?: number | null
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
          length_value?: number | null
          width_value?: number | null
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
          approved_variation_amount: number
          current_contract_amount: number
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
          approved_variation_amount?: number
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
      project_scope_corrections: {
        Row: {
          id: number
          project_id: number
          project_item_id: number
          company_id: number
          owner_user_id: string
          reason: string
          before_data: Json
          after_data: Json
          created_at: string
        }
        Insert: {
          id?: never
          project_id: number
          project_item_id: number
          company_id: number
          owner_user_id: string
          reason: string
          before_data: Json
          after_data: Json
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      invoices: {
        Row: {
          id: number
          project_id: number
          company_id: number
          owner_user_id: string
          invoice_no: string
          invoice_date: string
          due_date: string | null
          title: string
          notes: string
          status: string
          total_amount: number
          paid_amount: number
          balance_amount: number
          contract_value_snapshot: number | null
          previous_billed_amount_snapshot: number | null
          contract_balance_after_snapshot: number | null
          issued_at: string | null
          fully_paid_at: string | null
          voided_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          project_id: number
          company_id?: number
          owner_user_id?: string
          invoice_no?: string
          invoice_date?: string
          due_date?: string | null
          title?: string
          notes?: string
          status?: string
          total_amount?: number
          paid_amount?: number
          contract_value_snapshot?: number | null
          previous_billed_amount_snapshot?: number | null
          contract_balance_after_snapshot?: number | null
          issued_at?: string | null
          fully_paid_at?: string | null
          voided_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          invoice_date?: string
          due_date?: string | null
          title?: string
          notes?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          id: number
          invoice_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          variation_order_id: number | null
          source_type: string
          description: string
          percentage: number | null
          amount: number
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          invoice_id: number
          project_id?: number
          company_id?: number
          owner_user_id?: string
          variation_order_id?: number | null
          source_type?: string
          description: string
          percentage?: number | null
          amount: number
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          variation_order_id?: number | null
          source_type?: string
          description?: string
          percentage?: number | null
          amount?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      invoice_snapshots: {
        Row: {
          id: number
          invoice_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          snapshot_data: Json
          created_at: string
        }
        Insert: {
          id?: never
          invoice_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          snapshot_data: Json
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      invoice_payments: {
        Row: {
          id: number
          invoice_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          receipt_no: string
          payment_date: string
          amount: number
          payment_method: string
          reference_no: string | null
          notes: string
          invoice_total_snapshot: number
          paid_before_snapshot: number
          paid_after_snapshot: number
          balance_after_snapshot: number
          created_at: string
        }
        Insert: {
          id?: never
          invoice_id: number
          project_id?: number
          company_id?: number
          owner_user_id?: string
          receipt_no?: string
          payment_date?: string
          amount: number
          payment_method: string
          reference_no?: string | null
          notes?: string
          invoice_total_snapshot?: number
          paid_before_snapshot?: number
          paid_after_snapshot?: number
          balance_after_snapshot?: number
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      payment_schedules: {
        Row: {
          id: number
          project_id: number
          company_id: number
          owner_user_id: string
          title: string
          notes: string
          basis_amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          project_id: number
          company_id: number
          owner_user_id: string
          title?: string
          notes?: string
          basis_amount: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          notes?: string
          basis_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_schedule_stages: {
        Row: {
          id: number
          schedule_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          stage_no: number
          label: string
          description: string
          percentage: number
          amount: number
          created_at: string
        }
        Insert: {
          id?: never
          schedule_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          stage_no: number
          label: string
          description?: string
          percentage: number
          amount: number
          created_at?: string
        }
        Update: {
          stage_no?: number
          label?: string
          description?: string
          percentage?: number
          amount?: number
        }
        Relationships: []
      }
      variation_orders: {
        Row: {
          id: number
          project_id: number
          company_id: number
          owner_user_id: string
          vo_no: string
          vo_date: string
          title: string
          reason: string
          status: string
          revision_no: number
          time_impact_days: number
          net_amount: number
          approval_method: string | null
          approval_note: string | null
          sent_at: string | null
          approved_at: string | null
          rejected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          project_id: number
          company_id: number
          owner_user_id: string
          vo_no: string
          vo_date?: string
          title?: string
          reason?: string
          status?: string
          revision_no?: number
          time_impact_days?: number
          net_amount?: number
          approval_method?: string | null
          approval_note?: string | null
          sent_at?: string | null
          approved_at?: string | null
          rejected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          vo_date?: string
          title?: string
          reason?: string
          status?: string
          revision_no?: number
          time_impact_days?: number
          net_amount?: number
          approval_method?: string | null
          approval_note?: string | null
          sent_at?: string | null
          approved_at?: string | null
          rejected_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      variation_order_sections: {
        Row: {
          id: number
          variation_order_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          source_project_section_id: number | null
          name: string
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          variation_order_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          source_project_section_id?: number | null
          name: string
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          source_project_section_id?: number | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      variation_order_items: {
        Row: {
          id: number
          variation_order_id: number
          section_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          catalog_item_id: number | null
          source_project_item_id: number | null
          change_type: string
          direction: string
          item_name: string
          description: string
          measurement_text: string | null
          calculation_method: string
          unit: string
          quantity: number
          rate: number
          line_amount: number
          signed_amount: number
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          variation_order_id: number
          section_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          catalog_item_id?: number | null
          source_project_item_id?: number | null
          change_type?: string
          direction?: string
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
          source_project_item_id?: number | null
          change_type?: string
          direction?: string
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
      variation_order_snapshots: {
        Row: {
          id: number
          variation_order_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          revision_no: number
          snapshot_data: Json
          created_at: string
        }
        Insert: {
          id?: never
          variation_order_id: number
          project_id: number
          company_id: number
          owner_user_id: string
          revision_no: number
          snapshot_data: Json
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
      correct_project_scope_item: {
        Args: {
          p_project_item_id: number
          p_item_name: string
          p_description: string
          p_measurement_text: string | null
          p_calculation_method: string
          p_unit: string
          p_quantity: number
          p_reason: string
        }
        Returns: Database['public']['Tables']['project_items']['Row']
      }
      create_project_invoice: {
        Args: {
          p_project_id: number
        }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      create_variation_order: {
        Args: {
          p_project_id: number
        }
        Returns: Database['public']['Tables']['variation_orders']['Row']
      }
      create_project_from_accepted_quotation: {
        Args: {
          p_quotation_id: number
        }
        Returns: Database['public']['Tables']['projects']['Row']
      }
      issue_project_invoice: {
        Args: {
          p_invoice_id: number
        }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      record_invoice_payment: {
        Args: {
          p_invoice_id: number
          p_payment_date: string
          p_amount: number
          p_payment_method: string
          p_reference_no?: string | null
          p_notes?: string
        }
        Returns: Database['public']['Tables']['invoice_payments']['Row']
      }
      save_project_invoice_draft: {
        Args: {
          p_invoice_id: number
          p_invoice_date: string
          p_due_date: string | null
          p_title: string
          p_notes: string
          p_items: Json
        }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
      save_project_payment_schedule: {
        Args: {
          p_project_id: number
          p_title: string
          p_notes: string
          p_stages: Json
        }
        Returns: Database['public']['Tables']['payment_schedules']['Row']
      }
      record_variation_order_decision: {
        Args: {
          p_variation_order_id: number
          p_decision: string
          p_approval_method: string
          p_approval_note?: string | null
        }
        Returns: Database['public']['Tables']['variation_orders']['Row']
      }
      send_variation_order_revision: {
        Args: {
          p_variation_order_id: number
        }
        Returns: Database['public']['Tables']['variation_orders']['Row']
      }
      send_quotation_revision: {
        Args: {
          p_quotation_id: number
          p_revision_no: number
          p_snapshot_data: Json
        }
        Returns: Database['public']['Tables']['quotations']['Row']
      }
      save_quotation_draft: {
        Args: {
          p_quotation_id: number | null
          p_draft: Json
        }
        Returns: Database['public']['Tables']['quotations']['Row']
      }
      start_variation_order_revision: {
        Args: {
          p_variation_order_id: number
        }
        Returns: Database['public']['Tables']['variation_orders']['Row']
      }
      void_project_invoice: {
        Args: {
          p_invoice_id: number
        }
        Returns: Database['public']['Tables']['invoices']['Row']
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
