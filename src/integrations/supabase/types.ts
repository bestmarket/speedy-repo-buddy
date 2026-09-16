export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_providers: {
        Row: {
          api_key: string | null
          category: string
          enabled: boolean
          id: string
          label: string
          requires_key: boolean
          sort_order: number
          tier: string
          updated_at: string
          zero_cost: boolean
        }
        Insert: {
          api_key?: string | null
          category: string
          enabled?: boolean
          id: string
          label: string
          requires_key?: boolean
          sort_order?: number
          tier: string
          updated_at?: string
          zero_cost?: boolean
        }
        Update: {
          api_key?: string | null
          category?: string
          enabled?: boolean
          id?: string
          label?: string
          requires_key?: boolean
          sort_order?: number
          tier?: string
          updated_at?: string
          zero_cost?: boolean
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      channels: {
        Row: {
          active: boolean
          auto_post: boolean
          created_at: string
          handle: string
          id: string
          platform: string
          project_id: string | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          active?: boolean
          auto_post?: boolean
          created_at?: string
          handle?: string
          id?: string
          platform?: string
          project_id?: string | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          active?: boolean
          auto_post?: boolean
          created_at?: string
          handle?: string
          id?: string
          platform?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_config: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          angle: string | null
          created_at: string
          hook: string | null
          id: string
          project_id: string
          selected: boolean
          title: string
          user_id: string
        }
        Insert: {
          angle?: string | null
          created_at?: string
          hook?: string | null
          id?: string
          project_id: string
          selected?: boolean
          title: string
          user_id: string
        }
        Update: {
          angle?: string | null
          created_at?: string
          hook?: string | null
          id?: string
          project_id?: string
          selected?: boolean
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          channel_id: string
          created_at: string
          error: string | null
          external_url: string | null
          id: string
          posted_at: string | null
          status: string
          updated_at: string
          user_id: string
          video_id: string
        }
        Insert: {
          channel_id: string
          created_at?: string
          error?: string | null
          external_url?: string | null
          id?: string
          posted_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          video_id: string
        }
        Update: {
          channel_id?: string
          created_at?: string
          error?: string | null
          external_url?: string | null
          id?: string
          posted_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          brainstorm: string | null
          brainstorm_at: string | null
          channel_profile: Json | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brainstorm?: string | null
          brainstorm_at?: string | null
          channel_profile?: Json | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brainstorm?: string | null
          brainstorm_at?: string | null
          channel_profile?: Json | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scripts: {
        Row: {
          created_at: string
          description: string | null
          id: string
          idea_id: string | null
          project_id: string
          scenes: Json
          tags: string[] | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          idea_id?: string | null
          project_id: string
          scenes?: Json
          tags?: string[] | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          idea_id?: string | null
          project_id?: string
          scenes?: Json
          tags?: string[] | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      source_videos: {
        Row: {
          analysis: Json | null
          created_at: string
          error: string | null
          id: string
          position: number
          project_id: string
          published_at: string | null
          source_id: string
          status: string
          thumbnail_url: string | null
          title: string | null
          transcript: string | null
          transcript_source: string | null
          updated_at: string
          url: string
          user_id: string
          video_id: string
        }
        Insert: {
          analysis?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          position?: number
          project_id: string
          published_at?: string | null
          source_id: string
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          transcript_source?: string | null
          updated_at?: string
          url: string
          user_id: string
          video_id: string
        }
        Update: {
          analysis?: Json | null
          created_at?: string
          error?: string | null
          id?: string
          position?: number
          project_id?: string
          published_at?: string | null
          source_id?: string
          status?: string
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          transcript_source?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_videos_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          content: string
          created_at: string
          id: string
          kind: string
          label: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          category: string
          cost_usd: number
          created_at: string
          id: string
          provider: string
          success: boolean
          units: number
          user_id: string | null
        }
        Insert: {
          category: string
          cost_usd?: number
          created_at?: string
          id?: string
          provider: string
          success?: boolean
          units?: number
          user_id?: string | null
        }
        Update: {
          category?: string
          cost_usd?: number
          created_at?: string
          id?: string
          provider?: string
          success?: boolean
          units?: number
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      videos: {
        Row: {
          created_at: string
          error: string | null
          id: string
          language: string
          progress: number
          project_id: string
          scenes: Json
          scheduled_at: string | null
          script_id: string
          settings: Json
          status: string
          style: string
          title: string
          updated_at: string
          user_id: string
          video_path: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          language?: string
          progress?: number
          project_id: string
          scenes?: Json
          scheduled_at?: string | null
          script_id: string
          settings?: Json
          status?: string
          style?: string
          title?: string
          updated_at?: string
          user_id: string
          video_path?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          language?: string
          progress?: number
          project_id?: string
          scenes?: Json
          scheduled_at?: string | null
          script_id?: string
          settings?: Json
          status?: string
          style?: string
          title?: string
          updated_at?: string
          user_id?: string
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
