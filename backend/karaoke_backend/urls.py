from django.contrib import admin
from django.shortcuts import redirect
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static


def root_redirect(request):
    if request.user.is_authenticated:
        return redirect('ui_home')
    return redirect('ui_login')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('users.urls')),
    path('api/', include('songs.urls')),
    path('api/', include('scores.urls')),
    path('ui/', include('songs.urls_ui')),
    path('', root_redirect),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
