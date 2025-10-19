FROM nginx:alpine
RUN apk add --no-cache bash curl gettext
WORKDIR /usr/share/nginx/html
COPY . /usr/share/nginx/html
COPY nginx-default.conf /etc/nginx/conf.d/default.conf

# Replace __BACKEND_URL__ placeholder in index.html at container start
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
