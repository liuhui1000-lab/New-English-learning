-- Add a column to track who triggered the report (admin or student themselves)
ALTER TABLE public.error_analysis_reports
ADD COLUMN IF NOT EXISTS triggered_by uuid REFERENCES public.profiles(id) DEFAULT NULL;

-- Add RLS policies for deleting reports

-- 1. Users can delete their own reports
DROP POLICY IF EXISTS "Users can delete their own reports" ON public.error_analysis_reports;
CREATE POLICY "Users can delete their own reports"
  ON public.error_analysis_reports FOR DELETE
  USING (auth.uid() = user_id);

-- 2. Admins can delete any reports
DROP POLICY IF EXISTS "Admins can delete any reports" ON public.error_analysis_reports;
CREATE POLICY "Admins can delete any reports"
  ON public.error_analysis_reports FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
