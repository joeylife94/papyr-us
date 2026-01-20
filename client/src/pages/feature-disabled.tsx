import { Card, CardContent } from '@/components/ui/card';
import { Ban } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function FeatureDisabledPage({ featureName }: { featureName?: string }) {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <Ban className="h-8 w-8 text-slate-600" />
            <h1 className="text-2xl font-bold text-gray-900">Feature disabled</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            {featureName ? (
              <>
                The feature <span className="font-medium">{featureName}</span> is disabled in this
                deployment.
              </>
            ) : (
              <>This feature is disabled in this deployment.</>
            )}
          </p>

          <div className="mt-6">
            <Button asChild className="w-full">
              <Link to="/">Go home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
