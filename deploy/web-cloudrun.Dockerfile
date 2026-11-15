FROM nginx:stable-alpine
ARG API_UPSTREAM
RUN test -n "$API_UPSTREAM"
COPY deploy/nginx-cloudrun.conf.template /etc/nginx/templates/default.conf.template
RUN sed -i "s|__API_UPSTREAM__|${API_UPSTREAM}|g" /etc/nginx/templates/default.conf.template
COPY frontend/dist/ /usr/share/nginx/html/
